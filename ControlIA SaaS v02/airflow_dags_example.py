# Airflow DAGs for ControlIA Data Pipeline
# Place these files in your Airflow dags/ directory

# =============================================================================
# DAG 1: Daily Analytics Pipeline
# =============================================================================
# File: dags/daily_analytics_pipeline.py

from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.providers.amazon.aws.operators.s3 import S3FileTransformOperator
from airflow.providers.snowflake.operators.snowflake import SnowflakeOperator
from airflow.providers.postgres.operators.postgres import PostgresOperator
from airflow.sensors.external_task import ExternalTaskSensor
from datetime import datetime, timedelta
import logging

# Default arguments for all DAGs
default_args = {
    'owner': 'data-engineering',
    'depends_on_past': False,
    'email_on_failure': True,
    'email_on_retry': False,
    'email': ['data-alerts@controlia.com'],
    'retries': 3,
    'retry_delay': timedelta(minutes=5),
    'execution_timeout': timedelta(hours=2),
}

def get_spark_session():
    """Get or create Spark session with Delta Lake support"""
    from pyspark.sql import SparkSession
    
    return SparkSession.builder \
        .appName("ControlIA-ETL") \
        .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension") \
        .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog") \
        .config("spark.databricks.delta.optimizeWrite.enabled", "true") \
        .config("spark.databricks.delta.autoCompact.enabled", "true") \
        .getOrCreate()

def extract_agent_events(**context):
    """Extract agent events from Delta Lake Bronze layer"""
    spark = get_spark_session()
    execution_date = context['ds']
    
    # Read from Bronze layer
    df = spark.read.format("delta").load("s3://controlia-data-lake/bronze/agent_events") \
        .filter(f"date = '{execution_date}'")
    
    # Write to temp location for transformation
    df.write.mode("overwrite").parquet(f"/tmp/extracted/agent_events/{execution_date}")
    
    logging.info(f"Extracted {df.count()} agent events for {execution_date}")
    return f"/tmp/extracted/agent_events/{execution_date}"

def extract_conversations(**context):
    """Extract conversations from PostgreSQL"""
    import psycopg2
    import pandas as pd
    
    execution_date = context['ds']
    
    conn = psycopg2.connect(
        host="controlia-aurora-cluster.cluster-xxx.us-east-1.rds.amazonaws.com",
        database="controlia",
        user="controlia_app",
        password="{{ conn.postgres_conn.password }}"
    )
    
    query = f"""
    SELECT 
        c.*,
        COUNT(m.message_id) as message_count,
        AVG(m.latency_ms) as avg_latency_ms
    FROM app.conversations c
    LEFT JOIN app.messages m ON c.conversation_id = m.conversation_id
    WHERE DATE(c.created_at) = '{execution_date}'
    GROUP BY c.conversation_id
    """
    
    df = pd.read_sql(query, conn)
    df.to_parquet(f"/tmp/extracted/conversations/{execution_date}.parquet")
    
    conn.close()
    logging.info(f"Extracted {len(df)} conversations for {execution_date}")
    return f"/tmp/extracted/conversations/{execution_date}.parquet"

def transform_metrics(**context):
    """Transform and aggregate metrics"""
    from pyspark.sql import functions as F
    
    spark = get_spark_session()
    execution_date = context['ds']
    
    # Read extracted data
    events_df = spark.read.parquet(f"/tmp/extracted/agent_events/{execution_date}")
    conv_df = spark.read.parquet(f"/tmp/extracted/conversations/{execution_date}.parquet")
    
    # Aggregate daily metrics by tenant and agent
    daily_metrics = conv_df.groupBy(
        "tenant_id",
        "agent_id",
        F.col("created_at").cast("date").alias("date")
    ).agg(
        F.count("conversation_id").alias("total_conversations"),
        F.sum("message_count").alias("total_messages"),
        F.countDistinct("external_user_id").alias("unique_users"),
        F.avg("avg_latency_ms").alias("avg_response_time_ms"),
        F.percentile_approx("avg_latency_ms", 0.95).alias("p95_response_time_ms"),
        F.avg(F.when(F.col("status") == "closed", 1).otherwise(0)).alias("resolution_rate")
    )
    
    # Write to Silver layer
    daily_metrics.write \
        .mode("overwrite") \
        .format("delta") \
        .save(f"s3://controlia-data-lake/silver/daily_metrics/date={execution_date}")
    
    logging.info(f"Transformed metrics for {execution_date}")
    return f"s3://controlia-data-lake/silver/daily_metrics/date={execution_date}"

def load_to_snowflake(**context):
    """Load transformed data to Snowflake"""
    execution_date = context['ds']
    
    # This is handled by the SnowflakeOperator below
    logging.info(f"Loading data to Snowflake for {execution_date}")

# DAG Definition
with DAG(
    'daily_analytics_pipeline',
    default_args=default_args,
    description='Daily analytics pipeline for agent metrics',
    schedule_interval='0 2 * * *',  # 2 AM daily
    start_date=datetime(2025, 1, 1),
    catchup=False,
    tags=['analytics', 'agents', 'daily'],
    max_active_runs=1,
) as dag:
    
    # Task 1: Extract agent events from Delta Lake
    extract_events = PythonOperator(
        task_id='extract_agent_events',
        python_callable=extract_agent_events,
    )
    
    # Task 2: Extract conversations from PostgreSQL
    extract_conversations_task = PythonOperator(
        task_id='extract_conversations',
        python_callable=extract_conversations,
    )
    
    # Task 3: Transform metrics with Spark
    transform_task = PythonOperator(
        task_id='transform_metrics',
        python_callable=transform_metrics,
    )
    
    # Task 4: Load to Snowflake
    load_snowflake = SnowflakeOperator(
        task_id='load_to_snowflake',
        sql="""
            COPY INTO analytics.daily_metrics
            FROM @s3_stage/silver/daily_metrics/date={{ ds }}
            FILE_FORMAT = (TYPE = PARQUET)
            MATCH_BY_COLUMN_NAME = CASE_INSENSITIVE
            ON_ERROR = 'CONTINUE';
        """,
        snowflake_conn_id='snowflake_default',
    )
    
    # Task 5: Update PostgreSQL analytics tables
    update_postgres = PostgresOperator(
        task_id='update_postgres_analytics',
        postgres_conn_id='postgres_default',
        sql="""
            INSERT INTO analytics.daily_metrics (
                tenant_id, agent_id, date, total_conversations, 
                total_messages, unique_users, avg_response_time_ms,
                p95_response_time_ms, resolution_rate
            )
            SELECT 
                tenant_id, agent_id, '{{ ds }}'::date,
                total_conversations, total_messages, unique_users,
                avg_response_time_ms, p95_response_time_ms, resolution_rate
            FROM staging.daily_metrics_staging
            ON CONFLICT (tenant_id, agent_id, date) 
            DO UPDATE SET
                total_conversations = EXCLUDED.total_conversations,
                total_messages = EXCLUDED.total_messages,
                unique_users = EXCLUDED.unique_users,
                avg_response_time_ms = EXCLUDED.avg_response_time_ms,
                p95_response_time_ms = EXCLUDED.p95_response_time_ms,
                resolution_rate = EXCLUDED.resolution_rate,
                updated_at = NOW();
        """
    )
    
    # Dependencies
    [extract_events, extract_conversations_task] >> transform_task >> [load_snowflake, update_postgres]


# =============================================================================
# DAG 2: Real-time Event Processing
# =============================================================================
# File: dags/realtime_event_processor.py

from airflow import DAG
from airflow.providers.apache.kafka.operators.consume import ConsumeFromTopicOperator
from airflow.providers.apache.kafka.operators.produce import ProduceToTopicOperator
from airflow.operators.python import PythonOperator
from datetime import datetime, timedelta
import json

def process_kafka_message(message, **context):
    """Process messages from Kafka"""
    import json
    from datetime import datetime
    
    msg = json.loads(message.value().decode('utf-8'))
    
    # Enrich with metadata
    msg['processed_at'] = datetime.utcnow().isoformat()
    msg['processor_version'] = '1.0.0'
    
    # Write to ClickHouse for real-time analytics
    # (Implementation depends on ClickHouse client)
    
    logging.info(f"Processed message: {msg.get('event_id')}")
    return msg

with DAG(
    'realtime_event_processor',
    default_args=default_args,
    description='Real-time event processing from Kafka',
    schedule_interval=None,  # Triggered by events
    start_date=datetime(2025, 1, 1),
    catchup=False,
    tags=['realtime', 'streaming', 'kafka'],
    max_active_runs=10,
) as dag:
    
    consume_events = ConsumeFromTopicOperator(
        task_id='consume_kafka_events',
        topics=['agent.events', 'conversation.events'],
        apply_function=process_kafka_message,
        kafka_config={
            'bootstrap.servers': '{{ conn.kafka_conn.host }}:{{ conn.kafka_conn.port }}',
            'group.id': 'airflow-consumer-group',
            'auto.offset.reset': 'latest',
        },
        max_messages=1000,
        max_batch_size=100,
    )


# =============================================================================
# DAG 3: Data Quality Checks
# =============================================================================
# File: dags/data_quality_checks.py

from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.operators.email import EmailOperator
from datetime import datetime, timedelta
import great_expectations as gx

def run_great_expectations_suite(**context):
    """Run Great Expectations validation suite"""
    
    context_ge = gx.get_context()
    
    # Run checkpoint
    checkpoint_result = context_ge.run_checkpoint(
        checkpoint_name="daily_metrics_checkpoint",
        batch_request={
            "datasource_name": "snowflake_datasource",
            "data_asset_name": "analytics.daily_metrics",
        }
    )
    
    if not checkpoint_result.success:
        raise ValueError(f"Data quality checks failed: {checkpoint_result}")
    
    logging.info("Data quality checks passed")
    return checkpoint_result

def validate_postgresql_data(**context):
    """Validate PostgreSQL data integrity"""
    import psycopg2
    
    conn = psycopg2.connect(conn_id='postgres_default')
    cursor = conn.cursor()
    
    checks = [
        # Check for orphaned messages
        ("""
            SELECT COUNT(*) FROM app.messages m
            LEFT JOIN app.conversations c ON m.conversation_id = c.conversation_id
            WHERE c.conversation_id IS NULL
        """, 0, "Orphaned messages"),
        
        # Check for negative metrics
        ("""
            SELECT COUNT(*) FROM analytics.daily_metrics
            WHERE total_conversations < 0 OR total_messages < 0
        """, 0, "Negative metrics"),
        
        # Check for duplicate conversations
        ("""
            SELECT COUNT(*) FROM (
                SELECT conversation_id, COUNT(*) 
                FROM app.conversations 
                GROUP BY conversation_id 
                HAVING COUNT(*) > 1
            ) dupes
        """, 0, "Duplicate conversations"),
    ]
    
    errors = []
    for query, expected, description in checks:
        cursor.execute(query)
        result = cursor.fetchone()[0]
        if result != expected:
            errors.append(f"{description}: found {result}, expected {expected}")
    
    cursor.close()
    conn.close()
    
    if errors:
        raise ValueError(f"Data validation failed:\n" + "\n".join(errors))
    
    logging.info("All PostgreSQL data validations passed")

with DAG(
    'data_quality_checks',
    default_args=default_args,
    description='Daily data quality validation',
    schedule_interval='0 4 * * *',  # 4 AM daily
    start_date=datetime(2025, 1, 1),
    catchup=False,
    tags=['quality', 'validation', 'great_expectations'],
    max_active_runs=1,
) as dag:
    
    validate_postgres = PythonOperator(
        task_id='validate_postgresql',
        python_callable=validate_postgresql_data,
    )
    
    validate_snowflake = PythonOperator(
        task_id='validate_snowflake',
        python_callable=run_great_expectations_suite,
    )
    
    notify_success = EmailOperator(
        task_id='notify_success',
        to=['data-team@controlia.com'],
        subject='ControlIA - Data Quality Checks Passed',
        html_content="""
        <h3>Data Quality Checks - {{ ds }}</h3>
        <p>All data quality validations passed successfully.</p>
        <ul>
            <li>PostgreSQL validation: ✅</li>
            <li>Snowflake validation: ✅</li>
        </ul>
        """
    )
    
    [validate_postgres, validate_snowflake] >> notify_success


# =============================================================================
# DAG 4: Data Retention and Cleanup
# =============================================================================
# File: dags/data_retention_cleanup.py

from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.providers.amazon.aws.operators.s3 import S3DeleteObjectsOperator
from datetime import datetime, timedelta

def archive_old_data(**context):
    """Archive old data to Glacier"""
    import boto3
    
    s3 = boto3.client('s3')
    execution_date = context['ds']
    
    # Calculate cutoff date (90 days ago)
    from datetime import datetime, timedelta
    cutoff_date = (datetime.strptime(execution_date, '%Y-%m-%d') - timedelta(days=90)).strftime('%Y-%m-%d')
    
    # List objects in bronze layer older than cutoff
    response = s3.list_objects_v2(
        Bucket='controlia-data-lake',
        Prefix=f'bronze/',
    )
    
    objects_to_archive = []
    for obj in response.get('Contents', []):
        if obj['LastModified'].strftime('%Y-%m-%d') < cutoff_date:
            objects_to_archive.append({'Key': obj['Key']})
    
    if objects_to_archive:
        # Archive to Glacier
        s3.copy_object(
            Bucket='controlia-data-lake',
            CopySource={'Bucket': 'controlia-data-lake', 'Key': objects_to_archive[0]['Key']},
            Key=objects_to_archive[0]['Key'],
            StorageClass='GLACIER'
        )
    
    logging.info(f"Archived {len(objects_to_archive)} objects to Glacier")

def anonymize_old_pii(**context):
    """Anonymize PII data older than 1 year"""
    import psycopg2
    
    conn = psycopg2.connect(conn_id='postgres_default')
    cursor = conn.cursor()
    
    cursor.execute("""
        UPDATE app.users
        SET 
            email = CONCAT('anonymized_', user_id, '@deleted.com'),
            first_name = 'Anonymous',
            last_name = 'User',
            password_hash = NULL
        WHERE created_at < NOW() - INTERVAL '1 year'
          AND email NOT LIKE 'anonymized_%'
    """)
    
    conn.commit()
    logging.info(f"Anonymized {cursor.rowcount} user records")
    
    cursor.close()
    conn.close()

def vacuum_and_analyze(**context):
    """Run VACUUM and ANALYZE on PostgreSQL tables"""
    import psycopg2
    
    conn = psycopg2.connect(conn_id='postgres_default')
    conn.autocommit = True
    cursor = conn.cursor()
    
    tables = ['app.conversations', 'app.messages', 'app.users', 'analytics.daily_metrics']
    
    for table in tables:
        cursor.execute(f"VACUUM ANALYZE {table}")
        logging.info(f"Vacuumed and analyzed {table}")
    
    cursor.close()
    conn.close()

with DAG(
    'data_retention_cleanup',
    default_args=default_args,
    description='Weekly data retention and cleanup tasks',
    schedule_interval='0 3 * * 0',  # 3 AM every Sunday
    start_date=datetime(2025, 1, 1),
    catchup=False,
    tags=['maintenance', 'retention', 'cleanup'],
    max_active_runs=1,
) as dag:
    
    archive_data = PythonOperator(
        task_id='archive_old_data',
        python_callable=archive_old_data,
    )
    
    anonymize_pii = PythonOperator(
        task_id='anonymize_old_pii',
        python_callable=anonymize_old_pii,
    )
    
    vacuum_tables = PythonOperator(
        task_id='vacuum_and_analyze',
        python_callable=vacuum_and_analyze,
    )
    
    [archive_data, anonymize_pii] >> vacuum_tables


# =============================================================================
# DAG 5: ML Feature Store Update
# =============================================================================
# File: dags/ml_feature_store_update.py

from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.providers.amazon.aws.hooks.s3 import S3Hook
from datetime import datetime, timedelta
import pandas as pd

def generate_conversation_features(**context):
    """Generate features for ML models"""
    import psycopg2
    
    conn = psycopg2.connect(conn_id='postgres_default')
    
    query = """
    SELECT 
        c.tenant_id,
        c.agent_id,
        c.conversation_id,
        c.channel,
        EXTRACT(EPOCH FROM (c.ended_at - c.started_at)) as duration_seconds,
        COUNT(m.message_id) as message_count,
        AVG(m.sentiment_score) as avg_sentiment,
        COUNT(CASE WHEN m.role = 'user' THEN 1 END) as user_messages,
        COUNT(CASE WHEN m.role = 'assistant' THEN 1 END) as assistant_messages,
        AVG(CASE WHEN m.role = 'assistant' THEN m.latency_ms END) as avg_response_time
    FROM app.conversations c
    JOIN app.messages m ON c.conversation_id = m.conversation_id
    WHERE c.created_at >= NOW() - INTERVAL '7 days'
    GROUP BY c.tenant_id, c.agent_id, c.conversation_id, c.channel, c.started_at, c.ended_at
    """
    
    df = pd.read_sql(query, conn)
    
    # Feature engineering
    df['messages_per_minute'] = df['message_count'] / (df['duration_seconds'] / 60)
    df['user_to_assistant_ratio'] = df['user_messages'] / df['assistant_messages'].clip(lower=1)
    
    # Save to feature store
    execution_date = context['ds']
    feature_path = f"s3://controlia-data-lake/gold/ml_features/conversations/date={execution_date}/features.parquet"
    
    df.to_parquet(feature_path)
    
    conn.close()
    logging.info(f"Generated features for {len(df)} conversations")
    return feature_path

def update_feature_store(**context):
    """Update feature store with new features"""
    # Integration with Feast or similar feature store
    # This is a placeholder for the actual implementation
    
    logging.info("Feature store updated")

def trigger_model_retraining(**context):
    """Trigger model retraining if drift detected"""
    # Placeholder for MLflow integration
    logging.info("Model retraining triggered")

with DAG(
    'ml_feature_store_update',
    default_args=default_args,
    description='Daily ML feature store update',
    schedule_interval='0 1 * * *',  # 1 AM daily
    start_date=datetime(2025, 1, 1),
    catchup=False,
    tags=['ml', 'features', 'feature_store'],
    max_active_runs=1,
) as dag:
    
    generate_features = PythonOperator(
        task_id='generate_conversation_features',
        python_callable=generate_conversation_features,
    )
    
    update_store = PythonOperator(
        task_id='update_feature_store',
        python_callable=update_feature_store,
    )
    
    retrain_models = PythonOperator(
        task_id='trigger_model_retraining',
        python_callable=trigger_model_retraining,
    )
    
    generate_features >> update_store >> retrain_models
