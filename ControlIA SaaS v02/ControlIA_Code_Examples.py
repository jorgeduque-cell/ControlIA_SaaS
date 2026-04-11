"""
ControlIA - Code Examples
Ejemplos de implementación de componentes principales
"""

# =============================================================================
# 1. LLM ROUTER
# =============================================================================

from typing import List, Dict, Optional, AsyncGenerator
from dataclasses import dataclass
from enum import Enum
import asyncio
import hashlib


class ModelTier(Enum):
    PREMIUM = "premium"
    STANDARD = "standard"
    ECONOMIC = "economic"
    LOCAL = "local"


@dataclass
class LLMRequest:
    messages: List[Dict[str, str]]
    model: Optional[str] = None
    temperature: float = 0.7
    max_tokens: Optional[int] = None
    stream: bool = False
    tools: Optional[List[Dict]] = None


@dataclass
class LLMResponse:
    content: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    finish_reason: str
    latency_ms: float


class LLMRouter:
    """
    Router inteligente para múltiples proveedores de LLM
    con fallback automático y caching
    """
    
    def __init__(self, config: Dict):
        self.config = config
        self.providers = {}
        self.cache = SemanticCache()
        self.fallback_chain = config.get('fallback_chain', [])
        
    async def route(self, request: LLMRequest) -> LLMResponse:
        """
        Ruta request al modelo más apropiado
        """
        # 1. Verificar cache
        cache_key = self._generate_cache_key(request)
        cached = await self.cache.get(cache_key)
        if cached:
            return cached
        
        # 2. Seleccionar modelo
        model = request.model or self._select_model(request)
        
        # 3. Intentar con modelo seleccionado
        try:
            response = await self._execute_with_model(request, model)
            await self.cache.set(cache_key, response)
            return response
        except Exception as e:
            # 4. Fallback
            return await self._fallback(request, model, e)
    
    def _select_model(self, request: LLMRequest) -> str:
        """
        Selecciona el mejor modelo basado en estrategia
        """
        strategy = self.config.get('default_strategy', 'cost_optimized')
        rules = self.config['strategies'][strategy]['routing_rules']
        
        # Calcular métricas de la request
        token_count = sum(len(m['content'].split()) for m in request.messages)
        complexity = self._estimate_complexity(request)
        
        for rule in rules:
            if rule.get('condition'):
                if self._evaluate_condition(rule['condition'], {
                    'token_count': token_count,
                    'complexity': complexity,
                    'task_type': self._detect_task_type(request)
                }):
                    return rule['model']
        
        return rules[-1].get('default', 'gpt-4o-mini')
    
    def _estimate_complexity(self, request: LLMRequest) -> float:
        """
        Estima complejidad de la request (0-1)
        """
        complexity_signals = 0
        
        # Longitud del prompt
        total_length = sum(len(m['content']) for m in request.messages)
        if total_length > 2000:
            complexity_signals += 0.3
        
        # Palabras clave de complejidad
        complex_keywords = ['analiza', 'compara', 'evalúa', 'sintetiza', 
                           'razona', 'justifica', 'investiga']
        content = ' '.join(m['content'].lower() for m in request.messages)
        if any(kw in content for kw in complex_keywords):
            complexity_signals += 0.4
        
        # Presencia de tools
        if request.tools:
            complexity_signals += 0.3
        
        return min(complexity_signals, 1.0)
    
    async def _fallback(self, request: LLMRequest, 
                        failed_model: str, error: Exception) -> LLMResponse:
        """
        Intenta con modelos de fallback
        """
        fallback_models = self.fallback_chain[
            self.fallback_chain.index(failed_model) + 1:
        ]
        
        for model in fallback_models:
            try:
                return await self._execute_with_model(request, model)
            except Exception:
                continue
        
        raise Exception(f"All models failed. Last error: {error}")


# =============================================================================
# 2. MEMORY MANAGER
# =============================================================================

from datetime import datetime, timedelta
import json


class MemoryManager:
    """
    Gestor de memoria jerárquica para agentes
    """
    
    def __init__(self, redis_client, vector_db, neo4j_client):
        self.redis = redis_client
        self.vector_db = vector_db
        self.neo4j = neo4j_client
        
    async def get_context(self, user_id: str, query: str, 
                          max_tokens: int = 4000) -> Dict:
        """
        Recupera contexto relevante de todos los niveles
        """
        context_parts = []
        
        # 1. Working Memory (sesión actual)
        working = await self._get_working_memory(user_id)
        if working:
            context_parts.append({"type": "working", "content": working})
        
        # 2. Long-term Memory (vector search)
        semantic = await self._search_long_term(user_id, query)
        if semantic:
            context_parts.append({"type": "semantic", "content": semantic})
        
        # 3. Knowledge Graph
        kg = await self._query_knowledge_graph(user_id, query)
        if kg:
            context_parts.append({"type": "knowledge_graph", "content": kg})
        
        # 4. Comprimir y combinar
        return await self._assemble_context(context_parts, max_tokens)
    
    async def store_interaction(self, user_id: str, agent_id: str,
                                user_message: str, assistant_message: str):
        """
        Almacena interacción en todos los niveles de memoria
        """
        timestamp = datetime.utcnow().isoformat()
        
        # 1. Working Memory
        await self._update_working_memory(user_id, {
            "user": user_message,
            "assistant": assistant_message,
            "timestamp": timestamp
        })
        
        # 2. Long-term Memory (async)
        asyncio.create_task(self._index_to_vector_db(
            user_id, agent_id, user_message, assistant_message, timestamp
        ))
        
        # 3. Knowledge Graph (async)
        asyncio.create_task(self._update_knowledge_graph(
            user_id, user_message, assistant_message
        ))
    
    async def _search_long_term(self, user_id: str, query: str, 
                                top_k: int = 5) -> List[Dict]:
        """
        Búsqueda semántica en memoria a largo plazo
        """
        # Generar embedding de la query
        query_embedding = await self._embed(query)
        
        # Buscar en vector DB
        results = await self.vector_db.search(
            vector=query_embedding,
            filter={"user_id": user_id},
            top_k=top_k
        )
        
        return [
            {
                "content": r.metadata["content"],
                "score": r.score,
                "timestamp": r.metadata.get("timestamp")
            }
            for r in results
        ]


# =============================================================================
# 3. RAG ENGINE
# =============================================================================

class RAGEngine:
    """
    Motor de Retrieval Augmented Generation
    """
    
    def __init__(self, vector_db, embedding_model, reranker=None):
        self.vector_db = vector_db
        self.embedding_model = embedding_model
        self.reranker = reranker
        
    async def retrieve(self, query: str, user_id: str, 
                       filters: Dict = None, top_k: int = 10) -> List[Dict]:
        """
        Recupera documentos relevantes
        """
        # 1. Generar embedding
        query_embedding = await self.embedding_model.embed(query)
        
        # 2. Vector search
        vector_results = await self.vector_db.search(
            vector=query_embedding,
            filter={"user_id": user_id, **(filters or {})},
            top_k=top_k * 2  # Más resultados para re-ranking
        )
        
        # 3. Re-ranking (si está habilitado)
        if self.reranker:
            reranked = await self.reranker.rerank(
                query=query,
                documents=[r.content for r in vector_results],
                top_k=top_k
            )
            return reranked
        
        return vector_results[:top_k]
    
    async def index_document(self, document: str, metadata: Dict,
                             chunking_strategy: str = "semantic"):
        """
        Indexa un documento en el sistema RAG
        """
        # 1. Chunking
        chunks = await self._chunk_document(document, chunking_strategy)
        
        # 2. Generar embeddings
        embeddings = await self.embedding_model.embed_batch(
            [c.content for c in chunks]
        )
        
        # 3. Indexar en vector DB
        for chunk, embedding in zip(chunks, embeddings):
            await self.vector_db.upsert(
                id=chunk.id,
                vector=embedding,
                metadata={
                    **metadata,
                    "content": chunk.content,
                    "chunk_index": chunk.index
                }
            )
    
    async def _chunk_document(self, document: str, 
                              strategy: str) -> List[Dict]:
        """
        Divide documento en chunks usando estrategia especificada
        """
        if strategy == "semantic":
            return await self._semantic_chunking(document)
        elif strategy == "recursive":
            return await self._recursive_chunking(document)
        else:
            return await self._fixed_chunking(document)
    
    async def _semantic_chunking(self, document: str) -> List[Dict]:
        """
        Chunking basado en similitud semántica
        """
        # Dividir en oraciones
        sentences = self._split_sentences(document)
        
        # Generar embeddings
        embeddings = await self.embedding_model.embed_batch(sentences)
        
        # Agrupar por similitud
        chunks = []
        current_chunk = [sentences[0]]
        current_embedding = embeddings[0]
        
        for i in range(1, len(sentences)):
            similarity = self._cosine_similarity(current_embedding, embeddings[i])
            
            if similarity >= 0.85:  # Threshold de similitud
                current_chunk.append(sentences[i])
            else:
                chunks.append({
                    "id": f"chunk_{len(chunks)}",
                    "content": " ".join(current_chunk),
                    "index": len(chunks)
                })
                current_chunk = [sentences[i]]
                current_embedding = embeddings[i]
        
        # Agregar último chunk
        if current_chunk:
            chunks.append({
                "id": f"chunk_{len(chunks)}",
                "content": " ".join(current_chunk),
                "index": len(chunks)
            })
        
        return chunks


# =============================================================================
# 4. TOOL REGISTRY
# =============================================================================

from typing import Callable, Any
import inspect


class ToolRegistry:
    """
    Registro de herramientas para agentes
    """
    
    def __init__(self):
        self.tools: Dict[str, Dict] = {}
        
    def register(self, name: str, description: str, 
                 parameters: Dict, func: Callable):
        """
        Registra una nueva herramienta
        """
        self.tools[name] = {
            "name": name,
            "description": description,
            "parameters": parameters,
            "function": func,
            "schema": self._generate_schema(name, description, parameters, func)
        }
    
    def _generate_schema(self, name: str, description: str,
                         parameters: Dict, func: Callable) -> Dict:
        """
        Genera schema OpenAI para la herramienta
        """
        return {
            "type": "function",
            "function": {
                "name": name,
                "description": description,
                "parameters": {
                    "type": "object",
                    "properties": parameters,
                    "required": list(parameters.keys())
                }
            }
        }
    
    async def execute(self, tool_name: str, parameters: Dict) -> Any:
        """
        Ejecuta una herramienta registrada
        """
        if tool_name not in self.tools:
            raise ValueError(f"Tool '{tool_name}' not found")
        
        tool = self.tools[tool_name]
        
        # Validar parámetros
        self._validate_parameters(parameters, tool["parameters"])
        
        # Ejecutar
        func = tool["function"]
        if asyncio.iscoroutinefunction(func):
            return await func(**parameters)
        else:
            return func(**parameters)
    
    def get_openai_tools(self) -> List[Dict]:
        """
        Retorna herramientas en formato OpenAI
        """
        return [tool["schema"] for tool in self.tools.values()]


# =============================================================================
# 5. GUARDRAILS ENGINE
# =============================================================================

import re


class GuardrailsEngine:
    """
    Sistema de guardrails para seguridad de IA
    """
    
    def __init__(self, config: Dict):
        self.config = config
        self.pii_patterns = {
            'email': r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
            'phone': r'\b(?:\+?\d{1,3}[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}\b',
            'ssn': r'\b\d{3}-\d{2}-\d{4}\b',
            'credit_card': r'\b(?:\d{4}[-\s]?){3}\d{4}\b',
        }
        
    async def validate_input(self, text: str, user_id: str) -> Dict:
        """
        Valida input del usuario
        """
        violations = []
        
        # 1. Longitud
        if len(text) > self.config.get('max_input_length', 10000):
            violations.append({
                "type": "length",
                "message": "Input exceeds maximum length"
            })
        
        # 2. Prompt injection
        if self.config.get('block_prompt_injection', True):
            injection_score = self._detect_prompt_injection(text)
            if injection_score > self.config.get('injection_threshold', 0.8):
                violations.append({
                    "type": "prompt_injection",
                    "message": "Potential prompt injection detected",
                    "score": injection_score
                })
        
        # 3. PII
        if not self.config.get('allow_pii_in_input', False):
            pii_found = self._detect_pii(text)
            if pii_found:
                violations.append({
                    "type": "pii",
                    "message": "PII detected in input",
                    "entities": pii_found
                })
        
        return {
            "valid": len(violations) == 0,
            "violations": violations
        }
    
    def _detect_prompt_injection(self, text: str) -> float:
        """
        Detecta intentos de prompt injection
        """
        injection_patterns = [
            r'ignore\s+(?:previous|above|all)\s+instructions',
            r'forget\s+(?:everything|all|your)\s+',
            r'you\s+are\s+now\s+',
            r'system\s*:\s*',
            r'\[\s*system\s*\]',
            r'\{\s*system\s*\}',
            r'new\s+instructions?\s*:',
            r'disregard\s+',
            r'override\s+',
        ]
        
        text_lower = text.lower()
        matches = sum(1 for pattern in injection_patterns 
                     if re.search(pattern, text_lower))
        
        return min(matches / len(injection_patterns) * 3, 1.0)
    
    def _detect_pii(self, text: str) -> List[Dict]:
        """
        Detecta información personal identifiable
        """
        findings = []
        
        for entity_type, pattern in self.pii_patterns.items():
            matches = re.finditer(pattern, text)
            for match in matches:
                findings.append({
                    "type": entity_type,
                    "value": match.group(),
                    "position": (match.start(), match.end())
                })
        
        return findings
    
    def redact_pii(self, text: str) -> str:
        """
        Elimina PII del texto
        """
        for entity_type, pattern in self.pii_patterns.items():
            text = re.sub(pattern, f'[{entity_type.upper()}_REDACTED]', text)
        return text


# =============================================================================
# 6. MULTI-AGENT ORCHESTRATOR
# =============================================================================

from typing import List, Dict, Optional
import asyncio


class Agent:
    """
    Agente individual en el sistema multi-agente
    """
    
    def __init__(self, agent_id: str, name: str, system_prompt: str,
                 tools: List[str], llm_router: LLMRouter):
        self.agent_id = agent_id
        self.name = name
        self.system_prompt = system_prompt
        self.tools = tools
        self.llm_router = llm_router
        
    async def execute(self, task: str, context: Dict) -> Dict:
        """
        Ejecuta una tarea asignada
        """
        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": f"Context: {context}\n\nTask: {task}"}
        ]
        
        response = await self.llm_router.route(LLMRequest(
            messages=messages,
            tools=self.tools
        ))
        
        return {
            "agent_id": self.agent_id,
            "agent_name": self.name,
            "response": response.content,
            "tokens_used": response.total_tokens
        }


class MultiAgentOrchestrator:
    """
    Orquestador de múltiples agentes
    """
    
    def __init__(self, llm_router: LLMRouter):
        self.llm_router = llm_router
        self.agents: Dict[str, Agent] = {}
        self.shared_state: Dict = {}
        
    def register_agent(self, agent: Agent):
        """
        Registra un agente en el orquestador
        """
        self.agents[agent.agent_id] = agent
        
    async def execute_workflow(self, workflow: Dict, 
                               initial_input: str) -> Dict:
        """
        Ejecuta un workflow multi-agente
        """
        results = []
        current_input = initial_input
        
        for step in workflow.get('steps', []):
            agent_id = step['agent_id']
            agent = self.agents.get(agent_id)
            
            if not agent:
                raise ValueError(f"Agent '{agent_id}' not found")
            
            # Ejecutar paso
            result = await agent.execute(
                task=step['task'],
                context={
                    "input": current_input,
                    "shared_state": self.shared_state,
                    "previous_results": results
                }
            )
            
            results.append(result)
            
            # Actualizar estado compartido
            self.shared_state[f"step_{len(results)}"] = result
            
            # Output del paso como input del siguiente
            current_input = result['response']
        
        return {
            "workflow_completed": True,
            "steps_executed": len(results),
            "results": results,
            "final_output": current_input
        }


# =============================================================================
# 7. USAGE EXAMPLE
# =============================================================================

async def main():
    """
    Ejemplo de uso del sistema ControlIA
    """
    
    # 1. Inicializar LLM Router
    router_config = {
        'default_strategy': 'cost_optimized',
        'strategies': {
            'cost_optimized': {
                'routing_rules': [
                    {'condition': 'token_count < 1000', 'model': 'gpt-4o-mini'},
                    {'default': 'gpt-4o'}
                ]
            }
        },
        'fallback_chain': ['gpt-4o', 'gpt-4o-mini', 'claude-3-haiku']
    }
    
    llm_router = LLMRouter(router_config)
    
    # 2. Inicializar Tool Registry
    tool_registry = ToolRegistry()
    
    # Registrar herramientas
    @tool_registry.register(
        name="search_web",
        description="Busca información en la web",
        parameters={
            "query": {"type": "string", "description": "Término de búsqueda"},
            "num_results": {"type": "integer", "description": "Número de resultados"}
        }
    )
    async def search_web(query: str, num_results: int = 5) -> List[Dict]:
        # Implementación de búsqueda web
        return [{"title": f"Result {i}", "url": f"http://example.com/{i}"} 
                for i in range(num_results)]
    
    # 3. Inicializar Guardrails
    guardrails = GuardrailsEngine({
        'max_input_length': 10000,
        'block_prompt_injection': True,
        'injection_threshold': 0.8,
        'allow_pii_in_input': False
    })
    
    # 4. Crear orquestador multi-agente
    orchestrator = MultiAgentOrchestrator(llm_router)
    
    # Registrar agentes
    research_agent = Agent(
        agent_id="researcher",
        name="Research Agent",
        system_prompt="Eres un agente de investigación experto en encontrar información relevante.",
        tools=["search_web"],
        llm_router=llm_router
    )
    
    writer_agent = Agent(
        agent_id="writer",
        name="Writer Agent", 
        system_prompt="Eres un agente escritor experto en redactar contenido claro y conciso.",
        tools=[],
        llm_router=llm_router
    )
    
    orchestrator.register_agent(research_agent)
    orchestrator.register_agent(writer_agent)
    
    # 5. Ejecutar workflow
    workflow = {
        'steps': [
            {'agent_id': 'researcher', 'task': 'Investiga sobre IA generativa en 2024'},
            {'agent_id': 'writer', 'task': 'Resume los hallazgos en un párrafo'}
        ]
    }
    
    result = await orchestrator.execute_workflow(workflow, "")
    print(f"Resultado final: {result['final_output']}")


if __name__ == "__main__":
    asyncio.run(main())
