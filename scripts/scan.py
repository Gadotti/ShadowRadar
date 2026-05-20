#### ShadowRadar — scan.py
#### Versão dedicada do analisador de CVEs que opera EXCLUSIVAMENTE sobre o
#### banco SQLite do ShadowRadar (sem entrada/saída via JSON).

import copy
import json
import os
import sqlite3
import sys
import time
import requests
from datetime import datetime, timedelta, timezone
from pathlib import Path
import argparse

# Força UTF-8 no stdout/stderr para evitar UnicodeEncodeError em consoles Windows (cp1252)
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def _carregar_dotenv() -> None:
    """Carrega variáveis do .env da pasta raiz do projeto (pai de scripts/).

    Só define variáveis que ainda não estejam no ambiente — o que o Node.js
    já injetou via process.env tem precedência. Não requer dependência externa.
    """
    env_file = Path(__file__).parent.parent / ".env"
    if not env_file.exists():
        return
    with open(env_file, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


_carregar_dotenv()

# --- Configurações ---
NVD_API_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0"
CLAUDE_API_URL = "https://api.anthropic.com/v1/messages"

# Retry e paginação para chamadas à API do Claude
_CLAUDE_MAX_TENTATIVAS = 4          # 1 original + 3 retries
_CLAUDE_RETRY_STATUS = {429, 500, 529}
_CLAUDE_RETRY_DELAY_BASE = 5        # segundos; delay = base * 2^tentativa → 5, 10, 20 s
_CLAUDE_TIMEOUT_BASE = 60           # segundos; aumenta 30 s por tentativa → 60, 90, 120, 150 s

# Parâmetros configuráveis (carregados da tabela config do ShadowRadar)
_CLAUDE_BATCH_SIZE = 20                              # ai.batch_size
_CLAUDE_MODEL = "claude-sonnet-4-20250514"           # ai.model
_CLAUDE_MAX_TOKENS = 16000                           # ai.max_tokens
_CLAUDE_TEMPERATURE = 0                              # ai.temperature
_CLAUDE_API_KEY_ENV = "ANTHROPIC_API_KEY"            # ai.api_key_env
_CLAUDE_API_KEY_SOURCE = "env_var"                   # ai.api_key_source ('env_var' | 'direct')
_CLAUDE_API_KEY_ENCRYPTED = ""                       # ai.api_key_encrypted (ciphertext)
_AI_ENABLED = True                                   # ai.enabled
_NVD_PAGE_SIZE = 50                                  # nist.page_size
_NVD_API_KEY = ""                                    # nist.api_key

# Valores de assessment que dispensam reprocessamento pela IA mesmo com versão diferente
ASSESSMENTS_ISENTOS = {"False Positive", "Accepted Risk", "Not Affected"}

# ---- Constantes de log ----
_SCRIPT_DIR  = Path(__file__).parent
_SCRIPT_NAME = Path(__file__).stem   # "scan"
_MAX_LOG_SIZE = 500 * 1024           # 500 KB


def _write_log(message: str, log_dir: Path) -> None:
    """Grava uma linha de log no arquivo, rotacionando quando exceder 500 KB.

    Formato: YYYY-MM-DD HH:MM:SS: <mensagem>
    """
    log_dir.mkdir(parents=True, exist_ok=True)

    log_file = log_dir / f"{_SCRIPT_NAME}.log"

    # Rotaciona se o arquivo já existe e ultrapassou o tamanho máximo
    if log_file.exists() and log_file.stat().st_size >= _MAX_LOG_SIZE:
        old_file = log_dir / f"{_SCRIPT_NAME}_old.old"
        log_file.rename(old_file)

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(f"{timestamp}: {message}\n")


# --- Utilitários ---
def gerar_id(name, version, tag=None):
    """Gera o ID único para um ativo baseado em nome, versão e tag"""
    if tag:
        return f"{name}_{version}_{tag}"
    return f"{name}_{version}"

def extrair_cves_anteriores(relatorio_anterior, id_ativo):
    """Extrai CVEs com assessment do relatório anterior para um dado ID"""
    if not relatorio_anterior:
        return {}

    for item in relatorio_anterior.get("report_items", []):
        if item.get("id") == id_ativo:
            cves_dict = {}
            for cve in item.get("cves", []):
                cve_id = cve.get("cve_id")
                if cve_id:
                    cves_dict[cve_id] = {
                        "assessment": cve.get("assessment", ""),
                        "claude_ai_assessment": cve.get("claude_ai_assessment", ""),
                        "published_date": cve.get("published_date", "")
                    }
            return cves_dict
    return {}

def extrair_pubEndDate_checked(relatorio_anterior, id_ativo):
    """Extrai o pubEndDate_checked do relatório anterior para um dado ID"""
    if not relatorio_anterior:
        return None

    for item in relatorio_anterior.get("report_items", []):
        if item.get("id") == id_ativo:
            return item.get("pubEndDate_checked")
    return None

def extrair_versao_anterior(relatorio_anterior, id_ativo):
    """Extrai a current_version registrada no relatório anterior para um dado ID"""
    if not relatorio_anterior:
        return None
    for item in relatorio_anterior.get("report_items", []):
        if item.get("id") == id_ativo:
            return item.get("current_version")
    return None

def extrair_lista_cves_anterior(relatorio_anterior, id_ativo):
    """Retorna a lista completa de CVEs do relatório anterior para um dado ID"""
    if not relatorio_anterior:
        return []
    for item in relatorio_anterior.get("report_items", []):
        if item.get("id") == id_ativo:
            return item.get("cves", [])
    return []

def extrair_cves_isentos(relatorio_anterior, name):
    """
    Retorna {cve_id: assessment} para CVEs com assessment isento (False Positive,
    Accepted Risk, Not Affected) em qualquer versão anterior do ativo com o mesmo nome.
    Usado para evitar reprocessamento pela IA mesmo quando a versão muda.
    """
    if not relatorio_anterior:
        return {}
    isentos = {}
    for item in relatorio_anterior.get("report_items", []):
        if item.get("name") == name:
            for cve in item.get("cves", []):
                if cve.get("assessment") in ASSESSMENTS_ISENTOS:
                    isentos[cve["cve_id"]] = cve["assessment"]
    return isentos

def calcular_pub_start_date(app, relatorio_anterior):
    """Determina o pub_start_date de um ativo sem fazer chamadas à API."""
    name = app.get("name")
    version = app.get("version")
    tag = app.get("tag")
    from_date_str = app.get("from_date")
    id_ativo = gerar_id(name, version, tag)

    versao_anterior = extrair_versao_anterior(relatorio_anterior, id_ativo)
    mesma_versao = relatorio_anterior is not None and versao_anterior == version

    if mesma_versao:
        candidatos = []
        if from_date_str:
            try:
                candidatos.append(datetime.strptime(from_date_str, "%Y-%m-%d"))
            except Exception:
                pass
        pub_end_date_anterior = extrair_pubEndDate_checked(relatorio_anterior, id_ativo)
        if pub_end_date_anterior:
            try:
                candidatos.append(datetime.strptime(pub_end_date_anterior, "%Y-%m-%d"))
            except Exception:
                pass
        return max(candidatos) if candidatos else None
    else:
        if from_date_str:
            try:
                return datetime.strptime(from_date_str, "%Y-%m-%d")
            except Exception:
                pass
        return None

def parse_cve_date(cve_info):
    """Extrai a data de publicação de um CVE"""
    try:
        published = cve_info.get("published", "")
        if published:
            return datetime.fromisoformat(published.replace("Z", "+00:00"))
    except Exception as e:
        print(f"Erro ao parsear data do CVE: {e}")
    return None

def formatar_data_publicacao(cve_info):
    """Formata a data de publicação do CVE para o formato yyyy-mm-dd"""
    cve_date = parse_cve_date(cve_info)
    if cve_date:
        return cve_date.strftime("%Y-%m-%d")
    return ""


# --- NVD ---
def buscar_cve_nvd(name, version, pub_start_date=None, log_dir: Path = None):
    """
    Busca CVEs na API do NVD com paginação completa.
    Quando pub_start_date é informado, itera em janelas de até 120 dias
    (limite da API ao usar pubStartDate/pubEndDate) até a data atual.
    Retorna uma tupla (lista_de_cves, pub_end_date_str).
    """
    hoje = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    pub_end_date = hoje

    # Montar lista de janelas de datas a consultar
    if pub_start_date:
        janelas = []
        inicio = pub_start_date
        while inicio < pub_end_date:
            fim = min(inicio + timedelta(days=120), pub_end_date)
            janelas.append((inicio, fim))
            inicio = fim
    else:
        janelas = [(None, None)]  # Busca sem filtro de data

    all_cves = []

    headers_nvd = {"apiKey": _NVD_API_KEY} if _NVD_API_KEY else {}

    for janela_inicio, janela_fim in janelas:
        params = {
            "keywordSearch": name,
            "keywordExactMatch": "",
            "resultsPerPage": _NVD_PAGE_SIZE,
        }

        if janela_inicio and janela_fim:
            params["pubStartDate"] = janela_inicio.strftime("%Y-%m-%dT%H:%M:%S.000")
            params["pubEndDate"] = janela_fim.strftime("%Y-%m-%dT%H:%M:%S.000")
            msg = f"  Janela: {janela_inicio.strftime('%Y-%m-%d')} → {janela_fim.strftime('%Y-%m-%d')}"
            print(msg)
            _write_log(msg, log_dir)

        start_index = 0

        try:
            while True:
                params["startIndex"] = start_index

                msg = f"  Consultando NVD (offset {start_index})..."
                print(msg)
                _write_log(msg, log_dir)

                response = requests.get(NVD_API_URL, params=params, headers=headers_nvd, timeout=10)
                response.raise_for_status()
                dados = response.json()

                vulnerabilities = dados.get("vulnerabilities", [])
                total_results = dados.get("totalResults", 0)

                if not vulnerabilities:
                    break

                for item in vulnerabilities:
                    cve_info = item.get("cve", {})
                    cve_id = cve_info.get("id", "")
                    description = cve_info.get("descriptions", [{}])[0].get("value", "")
                    published_date = formatar_data_publicacao(cve_info)

                    # Extrair severity e cvss_score (CVSS v3.1 ou v3.0)
                    metrics = cve_info.get("metrics", {})
                    severity = "UNKNOWN"
                    cvss_score = 0.0

                    if "cvssMetricV31" in metrics and metrics["cvssMetricV31"]:
                        cvss_data = metrics["cvssMetricV31"][0].get("cvssData", {})
                        severity = cvss_data.get("baseSeverity", "UNKNOWN")
                        cvss_score = float(cvss_data.get("baseScore", 0.0) or 0.0)
                    elif "cvssMetricV30" in metrics and metrics["cvssMetricV30"]:
                        cvss_data = metrics["cvssMetricV30"][0].get("cvssData", {})
                        severity = cvss_data.get("baseSeverity", "UNKNOWN")
                        cvss_score = float(cvss_data.get("baseScore", 0.0) or 0.0)

                    all_cves.append({
                        "cve_id": cve_id,
                        "description": description,
                        "severity": severity,
                        "cvss_score": cvss_score,
                        "published_date": published_date,
                        "assessment": "",
                        "claude_ai_assessment": ""
                    })

                start_index += len(vulnerabilities)
                if start_index >= total_results:
                    break

                # Respeitar rate limiting da API NVD
                time.sleep(0.6)

        except Exception as e:
            msg = f"Erro NVD {name} {version}: {e}"
            print(msg)
            _write_log(msg, log_dir)

    msg = f"  Total de CVEs encontrados: {len(all_cves)}"
    print(msg)
    _write_log(msg, log_dir)

    return all_cves, pub_end_date.strftime("%Y-%m-%d")


def _chamar_claude_lote(nome_ativo, versao_ativo, lote, api_key, log_dir: Path = None):
    """
    Envia um único lote de CVEs à API do Claude com retry e backoff exponencial.
    Retorna um dicionário {cve_id: resultado_analise}.
    """
    cves_info = []
    for i, cve in enumerate(lote, 1):
        cves_info.append(f"{i}. CVE: {cve['cve_id']}\n   Descrição: {cve['description']}\n   Severidade: {cve['severity']}")

    cves_texto = "\n\n".join(cves_info)

    prompt = f"""Você é um analista de segurança cibernética avaliando aplicabilidade de CVEs.

ATIVO: {nome_ativo}
VERSÃO: {versao_ativo}

CVEs PARA ANÁLISE:
{cves_texto}

REGRAS DE AVALIAÇÃO (aplique nesta ordem, sem exceção):

REGRA 1 — Escopo do produto:
- Marque "relevante": false se o CVE afeta apenas plugins, temas, extensões,
  integrações de terceiros ou produtos homônimos que NÃO sejam o núcleo de {nome_ativo}.
- Marque "relevante": true apenas se o CVE afeta o produto {nome_ativo} em si.

REGRA 2 — Aplicabilidade de versão (aplique somente se passou na Regra 1):
- Se a descrição do CVE lista EXPLICITAMENTE uma faixa de versões afetadas que
  inclui {versao_ativo}, marque "relevante": true.
- Se a descrição lista EXPLICITAMENTE versões afetadas e {versao_ativo} NÃO está
  na faixa, marque "relevante": false.
- Se a descrição NÃO lista versões de forma clara ou usa esquema de versionamento
  diferente do de {versao_ativo} (ex.: ano-based vs. semver), indique que a conclusão é
  indeterminada no campo "justificativa" e marque relevante": true. — NÃO tente inferir.

REGRA 3 — Comparação de versões:
- Use comparação semântica estrita. "before X.Y" significa versões < X.Y no mesmo
  esquema de versionamento.
- Se houver dois esquemas diferentes (ex.: 10.3 e 25.6), trate-os como faixas
  separadas e NÃO assuma equivalência.

FORMATO DE RESPOSTA:
Retorne APENAS um JSON válido, sem markdown, sem backticks, sem texto adicional.
Para cada CVE, inclua um campo "raciocinio" curto ANTES de "relevante" para
forçar análise explícita.

{{
    "CVE-XXXX-XXXXX": {{
        "raciocinio": "versões afetadas segundo descrição: X; versão do ativo: Y; comparação: ...",
        "relevante": true | false,
        "justificativa": "conclusão em uma frase"
    }}
}}"""

    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01"
    }
    body = {
        "model": _CLAUDE_MODEL,
        "max_tokens": _CLAUDE_MAX_TOKENS,
        "temperature": _CLAUDE_TEMPERATURE,
        "messages": [{"role": "user", "content": prompt}]
    }

    for tentativa in range(_CLAUDE_MAX_TENTATIVAS):
        timeout = _CLAUDE_TIMEOUT_BASE + 30 * tentativa  # 60, 90, 120, 150 s
        try:
            response = requests.post(CLAUDE_API_URL, headers=headers, json=body, timeout=timeout)

            # Erros transientes com código HTTP retryable
            if response.status_code in _CLAUDE_RETRY_STATUS:
                if tentativa < _CLAUDE_MAX_TENTATIVAS - 1:
                    # Respeitar Retry-After se a API informar
                    retry_after = response.headers.get("retry-after", "")
                    delay = int(retry_after) if retry_after.isdigit() else _CLAUDE_RETRY_DELAY_BASE * (2 ** tentativa)
                    msg = f"  ⚠ HTTP {response.status_code} — tentativa {tentativa + 1}/{_CLAUDE_MAX_TENTATIVAS}, aguardando {delay}s..."
                    print(msg)
                    _write_log(msg, log_dir)
                    time.sleep(delay)
                    continue
                msg = f"  ✗ HTTP {response.status_code} após {_CLAUDE_MAX_TENTATIVAS} tentativas."
                print(msg)
                _write_log(msg, log_dir)
                return {}

            response.raise_for_status()
            dados = response.json()

            resposta_texto = dados.get("content", [{}])[0].get("text", "").strip()
            resposta_texto = resposta_texto.replace("```json", "").replace("```", "").strip()

            return json.loads(resposta_texto)

        except json.JSONDecodeError as e:
            # Resposta malformada não é retryable
            msg = f"  ✗ Erro ao parsear resposta da Claude AI: {e}"
            print(msg)
            _write_log(msg, log_dir)
            msg = f"  Resposta recebida: {resposta_texto[:500]}"
            print(msg)
            _write_log(msg, log_dir)
            return {}

        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
            if tentativa < _CLAUDE_MAX_TENTATIVAS - 1:
                delay = _CLAUDE_RETRY_DELAY_BASE * (2 ** tentativa)
                msg = f"  ⚠ {type(e).__name__} (timeout={timeout}s) — tentativa {tentativa + 1}/{_CLAUDE_MAX_TENTATIVAS}, aguardando {delay}s..."
                print(msg)
                _write_log(msg, log_dir)
                time.sleep(delay)
            else:
                msg = f"  ✗ {type(e).__name__} após {_CLAUDE_MAX_TENTATIVAS} tentativas."
                print(msg)
                _write_log(msg, log_dir)
                return {}

        except Exception as e:
            msg = f"  ✗ Erro inesperado na consulta à Claude AI: {type(e).__name__}: {e}"
            print(msg)
            _write_log(msg, log_dir)
            return {}

    return {}


def analisar_cves_com_claude(nome_ativo, versao_ativo, cves_para_analise, log_dir: Path = None):
    """
    Analisa múltiplos CVEs via Claude AI em lotes de _CLAUDE_BATCH_SIZE.
    Retorna um dicionário com cve_id como chave e análise como valor.

    REQUER: Variável de ambiente apontada por ai.api_key_env configurada.
    """
    if not cves_para_analise:
        return {}

    if not _AI_ENABLED:
        msg = "  ⚠️  AVISO: análise da Claude AI desabilitada (ai.enabled=false). Pulando análise."
        print(msg)
        _write_log(msg, log_dir)
        return {}

    if _CLAUDE_API_KEY_SOURCE == "direct":
        if not _CLAUDE_API_KEY_ENCRYPTED:
            msg = "  ⚠️  AVISO: chave de API não configurada no banco. Pulando análise da Claude AI."
            print(msg)
            _write_log(msg, log_dir)
            return {}
        try:
            api_key = _decriptar_chave_api(_CLAUDE_API_KEY_ENCRYPTED)
        except Exception as exc:
            msg = f"  ⚠️  AVISO: falha ao descriptografar chave de API: {exc}. Pulando análise da Claude AI."
            print(msg)
            _write_log(msg, log_dir)
            return {}
    else:
        api_key = os.environ.get(_CLAUDE_API_KEY_ENV)
        if not api_key:
            msg = f"  ⚠️  AVISO: variável {_CLAUDE_API_KEY_ENV} não configurada. Pulando análise da Claude AI."
            print(msg)
            _write_log(msg, log_dir)
            return {}

    total = len(cves_para_analise)
    num_lotes = (total + _CLAUDE_BATCH_SIZE - 1) // _CLAUDE_BATCH_SIZE

    msg = f"  Consultando Claude AI: {total} CVE(s) em {num_lotes} lote(s) de até {_CLAUDE_BATCH_SIZE}..."
    print(msg)
    _write_log(msg, log_dir)

    resultado = {}
    for i in range(0, total, _CLAUDE_BATCH_SIZE):
        lote = cves_para_analise[i:i + _CLAUDE_BATCH_SIZE]
        num_lote = i // _CLAUDE_BATCH_SIZE + 1
        msg = f"  Lote {num_lote}/{num_lotes}: {len(lote)} CVE(s)..."
        print(msg)
        _write_log(msg, log_dir)

        analise_lote = _chamar_claude_lote(nome_ativo, versao_ativo, lote, api_key, log_dir)
        resultado.update(analise_lote)

    msg = f"  ✓ Análise Claude AI concluída ({len(resultado)} CVE(s) avaliados)"
    print(msg)
    _write_log(msg, log_dir)
    return resultado


def filtrar_e_enriquecer_cves(cves, cves_anteriores, nome_ativo, versao_ativo, log_dir: Path = None, cache_claude: dict = None, cves_isentos: dict = None):
    """
    Filtra CVEs usando análise da Claude AI e enriquece com dados anteriores.
    cache_claude:  dict compartilhado entre ativos do mesmo grupo (name, version).
    cves_isentos:  {cve_id: assessment} com valores isentos de reprocessamento (ex:
                   False Positive) vindos de qualquer versão anterior do mesmo ativo.
    """
    cves_com_assessment = []
    cves_para_analise = []
    reaproveitados_cache = 0
    isentos_preservados = 0

    for cve in cves:
        cve_id = cve["cve_id"]

        # Se já existe no relatório anterior (mesma versão) com assessment preenchido, manter
        if cve_id in cves_anteriores and cves_anteriores[cve_id]["assessment"]:
            cve["assessment"] = cves_anteriores[cve_id]["assessment"]
            cve["claude_ai_assessment"] = cves_anteriores[cve_id].get("claude_ai_assessment", "")
            cve["published_date"] = cves_anteriores[cve_id].get("published_date", cve["published_date"])
            cves_com_assessment.append(cve)

        # Se já foi analisado pela Claude anteriormente (mesma versão), manter
        elif cve_id in cves_anteriores and cves_anteriores[cve_id].get("claude_ai_assessment"):
            cve["assessment"] = cves_anteriores[cve_id]["assessment"]
            cve["claude_ai_assessment"] = cves_anteriores[cve_id]["claude_ai_assessment"]
            cve["published_date"] = cves_anteriores[cve_id].get("published_date", cve["published_date"])
            cves_com_assessment.append(cve)

        # Se o CVE tem assessment isento em qualquer versão anterior do mesmo ativo,
        # preservar sem reprocessar pela IA (mesmo que a versão tenha mudado)
        elif cves_isentos and cve_id in cves_isentos:
            cve["assessment"] = cves_isentos[cve_id]
            cves_com_assessment.append(cve)
            isentos_preservados += 1

        # Se outro ativo do mesmo grupo (name+version) já analisou este CVE, reaproveitar
        elif cache_claude is not None and cve_id in cache_claude:
            analise = cache_claude[cve_id]
            if analise.get("relevante", False):
                cve["claude_ai_assessment"] = analise.get("justificativa", "")
                cves_com_assessment.append(cve)
            # CVE descartado pelo grupo: não incluir
            reaproveitados_cache += 1

        # Senão, precisa de análise
        else:
            cves_para_analise.append(cve)

    if isentos_preservados:
        msg = f"  {isentos_preservados} CVE(s) com assessment isento preservado de versão anterior (sem reprocessamento pela IA)."
        print(msg)
        _write_log(msg, log_dir)

    if reaproveitados_cache:
        msg = f"  {reaproveitados_cache} CVE(s) com análise Claude AI reaproveitada do grupo (name+version)."
        print(msg)
        _write_log(msg, log_dir)

    # Analisar CVEs pendentes com Claude AI (em lote único)
    cves_filtrados = cves_com_assessment.copy()

    if cves_para_analise:
        msg = f"  {len(cves_para_analise)} CVE(s) necessitam análise da Claude AI"
        print(msg)
        _write_log(msg, log_dir)

        analise_claude = analisar_cves_com_claude(nome_ativo, versao_ativo, cves_para_analise, log_dir)

        # Salvar no cache do grupo para ativos subsequentes
        if cache_claude is not None:
            cache_claude.update(analise_claude)

        # Processar resultados
        for cve in cves_para_analise:
            cve_id = cve["cve_id"]

            if cve_id in analise_claude:
                analise = analise_claude[cve_id]
                relevante = analise.get("relevante", False)
                justificativa = analise.get("justificativa", "")

                if relevante:
                    cve["claude_ai_assessment"] = justificativa
                    cves_filtrados.append(cve)
                    msg = f"    ✓ {cve_id}: Relevante - {justificativa[:80]}..."
                else:
                    msg = f"    ✗ {cve_id}: Descartado - {justificativa[:80]}..."
            else:
                # Se não veio na análise, incluir por segurança
                cve["claude_ai_assessment"] = "Não foi possível analisar automaticamente"
                cves_filtrados.append(cve)
                msg = f"    ? {cve_id}: Incluído (análise inconclusiva)"

            print(msg)
            _write_log(msg, log_dir)

    return cves_filtrados


def avaliar_risco(cves):
    if any(c["severity"] == "HIGH" for c in cves):
        return "High"
    if any(c["severity"] == "MEDIUM" for c in cves):
        return "Medium"
    return "Low"


# --- Determina alerta ---
def gerar_alerta(risco):
    if risco == "High":
        return "Urgent update required"
    elif risco == "Medium":
        return "Review and update when possible"
    else:
        return "No immediate action required"


# --- Notificação ---
def send_notification(notification_hook: str, scan_timestamp: str, new_cves_found: list, log_dir: Path) -> None:
    """
    Envia uma notificação via POST ao notification hook informando os ativos
    com novos CVEs identificados na execução atual.
    """
    if not notification_hook:
        msg = "Notificação não enviada: --notification-hook não definido."
        print(msg)
        _write_log(msg, log_dir)
        return

    if not new_cves_found:
        msg = "Notificação não enviada: nenhum novo CVE identificado na execução."
        print(msg)
        _write_log(msg, log_dir)
        return

    payload = {
        "scan_timestamp": scan_timestamp,
        "new_cves_found": new_cves_found
    }

    msg = f"Enviando notificação para: {notification_hook}"
    print(msg)
    _write_log(msg, log_dir)

    try:
        response = requests.post(
            notification_hook,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        if response.status_code < 400:
            msg = f"✓ Notificação enviada com sucesso (HTTP {response.status_code})."
        else:
            msg = f"⚠️  Falha ao enviar notificação (HTTP {response.status_code})."
        print(msg)
        _write_log(msg, log_dir)
    except Exception as e:
        msg = f"✗ Erro ao enviar notificação: {type(e).__name__} - {e}"
        print(msg)
        _write_log(msg, log_dir)


# --- Análise completa ---
def analisar_aplicacoes(inventario, relatorio_anterior, log_dir: Path, progress_callback=None):
    """
    progress_callback(assets_processados: int, cves_totais: int) é chamado após cada
    asset ser analisado. Usado para atualizar scan_runs em tempo real.
    """
    itens = []
    ids_inventario = set()
    new_cves_found = []
    _assets_processados = 0
    _cves_acumulados = 0

    # Pré-passo: determinar a pub_start_date mínima por grupo (name, version).
    # Ativos com mesmo name+version compartilham a mesma consulta NVD e análise Claude AI.
    # Usar a data mais antiga garante que nenhum ativo fique sem CVEs que precisa.
    datas_por_grupo = {}  # (name, version) -> pub_start_date mínima (None = busca completa)
    for app in inventario:
        chave = (app.get("name"), app.get("version"))
        data = calcular_pub_start_date(app, relatorio_anterior)
        if chave not in datas_por_grupo:
            datas_por_grupo[chave] = data
        else:
            atual = datas_por_grupo[chave]
            if data is None or atual is None:
                datas_por_grupo[chave] = None
            else:
                datas_por_grupo[chave] = min(atual, data)

    cache_nvd = {}    # (name, version) -> (cves_raw, pub_end_date_str)
    cache_claude = {} # (name, version) -> {cve_id: resultado_analise}

    for app in inventario:
        name = app.get("name")
        url = app.get("url")
        version = app.get("version")
        tag = app.get("tag")

        id_ativo = gerar_id(name, version, tag)
        ids_inventario.add(id_ativo)
        chave = (name, version)

        msg = f"\nAnalisando {name} ({version}){f' [{tag}]' if tag else ''}... (ID: {id_ativo})"
        print(msg)
        _write_log(msg, log_dir)

        versao_anterior = extrair_versao_anterior(relatorio_anterior, id_ativo)
        mesma_versao = relatorio_anterior is not None and versao_anterior == version

        if mesma_versao:
            msg = f"  Versão idêntica à do relatório anterior ({version}). Buscando apenas novos CVEs."
        elif relatorio_anterior is not None:
            msg = f"  Versão alterada ({versao_anterior} → {version}). Recarregando lista de CVEs."
        else:
            msg = "  Sem relatório anterior. Criando nova lista de CVEs."
        print(msg)
        _write_log(msg, log_dir)

        # Consulta NVD: reutilizar se já feita para este grupo
        if chave not in cache_nvd:
            pub_start_date = datas_por_grupo[chave]
            if pub_start_date:
                msg = f"  Buscando CVEs a partir de: {pub_start_date.strftime('%Y-%m-%d')}"
            else:
                msg = "  Buscando CVEs sem filtro de data"
            print(msg)
            _write_log(msg, log_dir)

            cves_raw, pub_end_date_str = buscar_cve_nvd(name, version, pub_start_date, log_dir)
            cache_nvd[chave] = (cves_raw, pub_end_date_str)
        else:
            cves_raw, pub_end_date_str = cache_nvd[chave]
            msg = f"  Reutilizando consulta NVD do grupo ({name} {version}) — {len(cves_raw)} CVE(s) em cache."
            print(msg)
            _write_log(msg, log_dir)

        # Deep-copy para não contaminar o cache com modificações deste ativo
        cves_novos = copy.deepcopy(cves_raw)

        # Inicializar cache Claude do grupo se necessário
        if chave not in cache_claude:
            cache_claude[chave] = {}

        # Extrair dados anteriores deste ativo e filtrar/enriquecer com Claude
        cves_anteriores = extrair_cves_anteriores(relatorio_anterior, id_ativo)
        cves_isentos = extrair_cves_isentos(relatorio_anterior, name)
        cves_novos = filtrar_e_enriquecer_cves(
            cves_novos, cves_anteriores, name, version, log_dir,
            cache_claude=cache_claude[chave],
            cves_isentos=cves_isentos
        )

        if mesma_versao:
            # Manter CVEs anteriores e acrescentar apenas os realmente novos
            ids_anteriores = {c["cve_id"] for c in extrair_lista_cves_anterior(relatorio_anterior, id_ativo)}
            cves_realmente_novos = [c for c in cves_novos if c["cve_id"] not in ids_anteriores]
            cves = extrair_lista_cves_anterior(relatorio_anterior, id_ativo) + cves_realmente_novos
            if cves_realmente_novos:
                msg = f"  {len(cves_realmente_novos)} novo(s) CVE(s) adicionado(s) à lista existente."
                new_cves_found.append({
                    "id": id_ativo,
                    "name": name,
                    "current_version": version,
                    "new_cves_count": len(cves_realmente_novos)
                })
            else:
                msg = "  Nenhum novo CVE identificado no período."
            print(msg)
            _write_log(msg, log_dir)
        else:
            cves = cves_novos
            if cves_novos:
                new_cves_found.append({
                    "id": id_ativo,
                    "name": name,
                    "current_version": version,
                    "new_cves_count": len(cves_novos)
                })

        msg = f"  Total de CVEs relevantes após análise: {len(cves)}"
        print(msg)
        _write_log(msg, log_dir)

        risk = avaliar_risco(cves)
        alert = gerar_alerta(risk)

        itens.append({
            "id": id_ativo,
            "name": name,
            "url": url,
            "current_version": version,
            "pubEndDate_checked": pub_end_date_str,
            "cves": cves,
            "risk": risk,
            "alert": alert
        })

        _assets_processados += 1
        _cves_acumulados += len(cves)
        if progress_callback:
            progress_callback(_assets_processados, _cves_acumulados)

    # Verificar se há itens no relatório anterior que não estão mais no inventário
    if relatorio_anterior:
        for item_anterior in relatorio_anterior.get("report_items", []):
            id_anterior = item_anterior.get("id")
            if id_anterior and id_anterior not in ids_inventario:
                msg = f"\nItem removido do inventário: {id_anterior}"
                print(msg)
                _write_log(msg, log_dir)

    report = {
        "last_scan": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "report_items": itens
    }
    return report, new_cves_found


# =====================================================================
# Camada de integração com o banco SQLite do ShadowRadar
# =====================================================================
#
# Lê assets/config diretamente do banco SQLite do ShadowRadar e grava os
# resultados de volta na tabela asset_cves, atualizando o scan_run em
# andamento. O fluxo lógico (paginação NVD, filtragem com IA, preservação
# de assessments isentos, scan incremental por janelas de 120 dias) é
# preservado integralmente.
#
# Estado por asset (gravado ao final de cada scan bem-sucedido):
#   - assets.last_scanned_version → versão de fato escaneada na última execução,
#     usada para detectar troca de versão e disparar rescan completo.
#   - assets.last_scanned_pub_end → pubEndDate consultada por último na NVD,
#     usada como ponto de partida da janela incremental.
# =====================================================================


def conectar_db(db_path: str) -> sqlite3.Connection:
    """Conecta ao SQLite do ShadowRadar. WAL já é configurado pelo Node."""
    conn = sqlite3.connect(db_path, timeout=30.0)
    conn.row_factory = sqlite3.Row
    # PRAGMAs idempotentes — não alteram journal_mode (mantém WAL).
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def carregar_config_db(conn: sqlite3.Connection) -> dict:
    """Lê toda a tabela config como dicionário {key: value}."""
    rows = conn.execute("SELECT key, value FROM config").fetchall()
    return {r["key"]: r["value"] for r in rows}


def _decriptar_chave_api(encrypted_str: str) -> str:
    """Descriptografa a API key armazenada no banco usando ENCRYPTION_KEY do ambiente.

    Espera formato: ivHex:tagHex:ciphertextHex (produzido por src/crypto.js).
    Requer: pip install cryptography
    """
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError as exc:
        raise ImportError(
            "Pacote 'cryptography' necessário para descriptografar a chave de API. "
            "Execute: pip install cryptography"
        ) from exc

    enc_key_hex = os.environ.get("ENCRYPTION_KEY", "")
    if not enc_key_hex or len(enc_key_hex) != 64:
        raise ValueError(
            "ENCRYPTION_KEY deve ser uma string hex de 64 caracteres (32 bytes). "
            "Gere com: openssl rand -hex 32"
        )

    parts = encrypted_str.split(":")
    if len(parts) != 3:
        raise ValueError("Formato de chave criptografada inválido (esperado: iv:tag:dados)")

    iv_hex, tag_hex, data_hex = parts
    key  = bytes.fromhex(enc_key_hex)
    iv   = bytes.fromhex(iv_hex)
    tag  = bytes.fromhex(tag_hex)
    data = bytes.fromhex(data_hex)

    aesgcm = AESGCM(key)
    return aesgcm.decrypt(iv, data + tag, None).decode("utf-8")


def aplicar_config_db(cfg: dict, log_dir: Path) -> None:
    """Sobrescreve as constantes globais com valores vindos da tabela config."""
    global _NVD_PAGE_SIZE, _NVD_API_KEY
    global _AI_ENABLED, _CLAUDE_MODEL, _CLAUDE_MAX_TOKENS, _CLAUDE_TEMPERATURE
    global _CLAUDE_BATCH_SIZE, _CLAUDE_API_KEY_ENV, CLAUDE_API_URL
    global _CLAUDE_API_KEY_SOURCE, _CLAUDE_API_KEY_ENCRYPTED

    def _int(key, default):
        try:
            return int(cfg.get(key, default))
        except (TypeError, ValueError):
            return int(default)

    def _float(key, default):
        try:
            return float(cfg.get(key, default))
        except (TypeError, ValueError):
            return float(default)

    _NVD_PAGE_SIZE = _int("nist.page_size", _NVD_PAGE_SIZE)
    _NVD_API_KEY = (cfg.get("nist.api_key") or "").strip()

    _AI_ENABLED = (cfg.get("ai.enabled", "true").strip().lower() == "true")
    _CLAUDE_MODEL = (cfg.get("ai.model") or _CLAUDE_MODEL).strip()
    _CLAUDE_MAX_TOKENS = _int("ai.max_tokens", _CLAUDE_MAX_TOKENS)
    _CLAUDE_TEMPERATURE = _float("ai.temperature", _CLAUDE_TEMPERATURE)
    _CLAUDE_BATCH_SIZE = _int("ai.batch_size", _CLAUDE_BATCH_SIZE)
    _CLAUDE_API_KEY_ENV = (cfg.get("ai.api_key_env") or _CLAUDE_API_KEY_ENV).strip()
    _CLAUDE_API_KEY_SOURCE = (cfg.get("ai.api_key_source") or "env_var").strip()
    _CLAUDE_API_KEY_ENCRYPTED = (cfg.get("ai.api_key_encrypted") or "").strip()

    api_url_base = (cfg.get("ai.api_url") or "").strip()
    if api_url_base:
        CLAUDE_API_URL = api_url_base.rstrip("/") + "/v1/messages"

    msg = (
        f"Config aplicada do banco: nvd_page_size={_NVD_PAGE_SIZE}, ai_enabled={_AI_ENABLED}, "
        f"ai_model={_CLAUDE_MODEL}, ai_batch={_CLAUDE_BATCH_SIZE}, "
        f"ai_key_source={_CLAUDE_API_KEY_SOURCE}, ai_key_env={_CLAUDE_API_KEY_ENV}"
    )
    print(msg)
    _write_log(msg, log_dir)


def listar_assets_db(conn: sqlite3.Connection, asset_id: int = None) -> list:
    """Retorna a lista de assets a serem escaneados (ativos, ou um asset específico)."""
    if asset_id is not None:
        rows = conn.execute("SELECT * FROM assets WHERE id = ?", (asset_id,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM assets WHERE active = 1 ORDER BY id").fetchall()
    return [dict(r) for r in rows]


def localizar_scan_run(conn: sqlite3.Connection) -> int:
    """Retorna o id do scan_run em andamento (criado pelo Node antes de invocar o script)."""
    row = conn.execute(
        "SELECT id FROM scan_runs WHERE status='running' ORDER BY id DESC LIMIT 1"
    ).fetchone()
    return row["id"] if row else None


def construir_relatorio_anterior_db(conn: sqlite3.Connection, assets: list) -> tuple:
    """
    Sintetiza um "relatório anterior" no formato esperado por analisar_aplicacoes()
    a partir do estado atual de asset_cves + assets.last_scanned_*.
    Devolve (relatorio_dict, full_rescan_set).

    Para cada asset:
      - prev_version = assets.last_scanned_version (ou "" se nunca escaneado).
      - O id do item no relatório anterior é gerado com prev_version, de modo que
        bate com o id_ativo do inventário só quando a versão NÃO mudou — é o que
        dispara/mantém o carry-over de CVEs por id em analisar_aplicacoes().
      - pubEndDate_checked = assets.last_scanned_pub_end (data exata do último
        scan, mais precisa que MAX(asset_cves.scanned_at)).

    full_rescan_set contém asset_ids cuja versão atual difere da última escaneada
    (incluindo o caso em que nunca foi escaneado).
    """
    report_items = []
    full_rescan = set()

    for a in assets:
        cves_rows = conn.execute(
            "SELECT cve_id, description, severity, cvss_score, published_at, "
            "       user_assessment, ai_assessment "
            "FROM asset_cves WHERE asset_id = ? ORDER BY id",
            (a["id"],)
        ).fetchall()

        prev_version = a.get("last_scanned_version") or ""
        # last_scanned_pub_end guarda o datetime completo do scan; para a janela
        # incremental da NVD só precisamos da parte de data (YYYY-MM-DD).
        prev_pub_end_raw = a.get("last_scanned_pub_end") or ""
        prev_pub_end = prev_pub_end_raw[:10] if prev_pub_end_raw else None

        if prev_version != a["current_version"]:
            full_rescan.add(a["id"])

        if not cves_rows and not prev_version:
            # Asset nunca escaneado e sem CVEs registrados → será tratado como novo.
            continue

        prev_id = gerar_id(a["name"], prev_version, a["tag"])

        cves = []
        for c in cves_rows:
            cves.append({
                "cve_id": c["cve_id"],
                "description": c["description"] or "",
                "severity": c["severity"] or "UNKNOWN",
                "cvss_score": c["cvss_score"] if c["cvss_score"] is not None else 0.0,
                "published_date": (c["published_at"][:10] if c["published_at"] else ""),
                "assessment": c["user_assessment"] or "",
                "claude_ai_assessment": c["ai_assessment"] or "",
            })

        report_items.append({
            "id": prev_id,
            "name": a["name"],
            "url": a["url"] or "",
            "current_version": prev_version,
            "pubEndDate_checked": prev_pub_end,
            "cves": cves,
            "risk": "",
            "alert": "",
        })

    return {"last_scan": "", "report_items": report_items}, full_rescan


def _criar_scan_run(conn: sqlite3.Connection, started_at: str) -> int:
    """Cria um scan_run com status=running. Usado quando o script é invocado diretamente (sem ShadowRadar)."""
    cursor = conn.execute(
        "INSERT INTO scan_runs (started_at, status, assets_scanned, cves_found) VALUES (?, 'running', 0, 0)",
        (started_at,)
    )
    conn.commit()
    return cursor.lastrowid


def _finalizar_scan_run(conn: sqlite3.Connection, run_id: int, status: str, error_message: str = None) -> None:
    """Atualiza finished_at, status e (opcionalmente) error_message do scan_run."""
    finished_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    if error_message:
        conn.execute(
            "UPDATE scan_runs SET status=?, finished_at=?, error_message=? WHERE id=?",
            (status, finished_at, error_message, run_id)
        )
    else:
        conn.execute(
            "UPDATE scan_runs SET status=?, finished_at=? WHERE id=?",
            (status, finished_at, run_id)
        )
    conn.commit()


def _atualizar_progresso_run(conn: sqlite3.Connection, run_id: int, assets_scanned: int, cves_found: int) -> None:
    if run_id is None:
        return
    conn.execute(
        "UPDATE scan_runs SET assets_scanned = ?, cves_found = ? WHERE id = ?",
        (assets_scanned, cves_found, run_id),
    )
    conn.commit()


def _severidade_para_db(s: str) -> str:
    """Mapeia severidades vindas da NVD para o CHECK do schema (CRITICAL/HIGH/MEDIUM/LOW/NONE)."""
    if not s:
        return "NONE"
    up = s.upper()
    if up in ("CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"):
        return up
    return "NONE"


def _published_at_db(cve_dict: dict) -> str:
    """Converte published_date (YYYY-MM-DD) para timestamp ISO. Retorna None se vazio."""
    pd = cve_dict.get("published_date") or ""
    if not pd:
        return None
    return pd + "T00:00:00Z" if "T" not in pd else pd


def persistir_resultado_db(conn: sqlite3.Connection, relatorio: dict,
                           asset_id_by_id_ativo: dict, full_rescan: set,
                           log_dir: Path) -> None:
    """
    Grava os resultados em asset_cves:
      - Em rescan completo: DELETE all + INSERT (preserva apenas assessments isentos
        já mesclados pelo script em filtrar_e_enriquecer_cves).
      - Em incremental: INSERT apenas dos cve_ids que ainda não existem no asset
        (preserva user_assessment, user_notes, ai_assessment e evaluated_at).
    O progresso em scan_runs é atualizado durante a análise via progress_callback.
    """
    # ISO-8601 local com offset explícito (ex.: 2026-05-09T15:43:17-03:00).
    now = datetime.now().astimezone().isoformat(timespec="seconds")

    insert_sql = (
        "INSERT INTO asset_cves "
        "  (asset_id, cve_id, description, severity, cvss_score, published_at, "
        "   user_assessment, ai_assessment, scanned_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )

    update_state_sql = (
        "UPDATE assets SET last_scanned_version = ?, last_scanned_pub_end = ? WHERE id = ?"
    )

    for item in relatorio.get("report_items", []):
        id_ativo = item.get("id")
        asset_id = asset_id_by_id_ativo.get(id_ativo)
        if asset_id is None:
            continue  # asset removido entre carregamento e persistência (defensivo)

        cves_resultado = item.get("cves", [])
        is_full = asset_id in full_rescan

        if is_full:
            conn.execute("DELETE FROM asset_cves WHERE asset_id = ?", (asset_id,))
            cves_para_inserir = cves_resultado
        else:
            existentes = {
                r["cve_id"] for r in conn.execute(
                    "SELECT cve_id FROM asset_cves WHERE asset_id = ?", (asset_id,)
                ).fetchall()
            }
            cves_para_inserir = [c for c in cves_resultado if c["cve_id"] not in existentes]

        for c in cves_para_inserir:
            conn.execute(insert_sql, (
                asset_id,
                c.get("cve_id", ""),
                c.get("description", "") or "",
                _severidade_para_db(c.get("severity", "NONE")),
                float(c.get("cvss_score") or 0.0),
                _published_at_db(c),
                c.get("assessment") or None,
                c.get("claude_ai_assessment") or None,
                now,
            ))

        # Marca todas as linhas do asset como escaneadas agora — inclusive as que
        # já existiam e não foram reinseridas (caso incremental sem novos CVEs).
        # No full rescan é redundante porque os INSERTs acima já gravaram `now`.
        conn.execute(
            "UPDATE asset_cves SET scanned_at = ? WHERE asset_id = ?",
            (now, asset_id),
        )

        # Atualizar estado do asset: versão e datetime do scan.
        # last_scanned_pub_end recebe o datetime completo (mesmo formato que
        # asset_cves.scanned_at) para que o COALESCE no ShadowRadar retorne
        # timestamps consistentes entre assets com e sem CVEs.
        # A janela incremental da NVD usa só [:10] ao ler este campo.
        conn.execute(update_state_sql, (
            item.get("current_version") or "",
            now,
            asset_id,
        ))

        conn.commit()

        msg = (
            f"  → Asset {asset_id} ({item.get('name')}): "
            f"{'DELETE+INSERT' if is_full else 'INSERT incremental'} de "
            f"{len(cves_para_inserir)} CVE(s); total no relatório: {len(cves_resultado)}; "
            f"last_scanned_version='{item.get('current_version')}', "
            f"last_scanned_pub_end='{item.get('pubEndDate_checked')}'"
        )
        print(msg)
        _write_log(msg, log_dir)


def executar_scan(db_path: str, asset_id_filtro: int, notification_hook: str, log_dir: Path) -> None:
    """Pipeline completo: lê e grava direto no SQLite do ShadowRadar."""
    msg = f"=== ShadowRadar — Scan de CVEs ==="
    print(msg)
    _write_log(msg, log_dir)
    msg = f"Banco: {db_path}" + (f" | asset_id={asset_id_filtro}" if asset_id_filtro else " | todos os ativos ativos")
    print(msg)
    _write_log(msg, log_dir)

    if not os.path.exists(db_path):
        msg = f"✗ Banco SQLite não encontrado: {db_path}"
        print(msg)
        _write_log(msg, log_dir)
        sys.exit(1)

    conn = conectar_db(db_path)
    cfg = carregar_config_db(conn)
    aplicar_config_db(cfg, log_dir)

    started_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    run_id = localizar_scan_run(conn)
    if run_id is None:
        run_id = _criar_scan_run(conn, started_at)
        msg = f"scan_run criado pelo script: id={run_id}"
    else:
        msg = f"scan_run em andamento: id={run_id}"
    print(msg)
    _write_log(msg, log_dir)

    status_final = "completed"
    error_msg = None
    relatorio = None
    new_cves_found = []

    try:
        assets = listar_assets_db(conn, asset_id_filtro)
        if not assets:
            msg = "Nenhum asset encontrado para escanear."
            print(msg)
            _write_log(msg, log_dir)
            return

        msg = f"Inventário carregado do banco: {len(assets)} ativo(s)"
        print(msg)
        _write_log(msg, log_dir)

        # Construir inventário no formato esperado por analisar_aplicacoes
        inventario = []
        asset_id_by_id_ativo = {}
        for a in assets:
            inventario.append({
                "name": a["name"],
                "version": a["current_version"],
                "url": a["url"] or "",
                "tag": a["tag"],
                "from_date": a["cve_start_date"],
            })
            id_ativo = gerar_id(a["name"], a["current_version"], a["tag"])
            asset_id_by_id_ativo[id_ativo] = a["id"]

        relatorio_anterior, full_rescan = construir_relatorio_anterior_db(conn, assets)

        msg = (
            f"Estado anterior reconstituído: {len(relatorio_anterior['report_items'])} item(ns) "
            f"({len(full_rescan)} marcado(s) para rescan completo por edição do asset)"
        )
        print(msg)
        _write_log(msg, log_dir)

        def progress_callback(assets_processados: int, cves_totais: int) -> None:
            _atualizar_progresso_run(conn, run_id, assets_processados, cves_totais)

        relatorio, new_cves_found = analisar_aplicacoes(
            inventario, relatorio_anterior, log_dir, progress_callback=progress_callback
        )

        persistir_resultado_db(conn, relatorio, asset_id_by_id_ativo, full_rescan, log_dir)

        msg = "=== Análise completa ==="
        print(msg)
        _write_log(msg, log_dir)
        msg = f"Total de ativos analisados: {len(relatorio['report_items'])}"
        print(msg)
        _write_log(msg, log_dir)

    except Exception as e:
        status_final = "failed"
        error_msg = f"{type(e).__name__}: {e}"
        msg = f"✗ Erro durante execução: {error_msg}"
        print(msg)
        _write_log(msg, log_dir)
        raise

    finally:
        _finalizar_scan_run(conn, run_id, status_final, error_msg)
        conn.close()

    if relatorio:
        send_notification(notification_hook, relatorio["last_scan"], new_cves_found, log_dir)


# --- Execução ---
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="ShadowRadar — Analisador de riscos de aplicações web com IA (modo SQLite)."
    )
    parser.add_argument(
        "--db",
        required=True,
        help="Caminho do banco SQLite do ShadowRadar.",
    )
    parser.add_argument(
        "--asset-id",
        type=int,
        default=None,
        help="Restringe o scan a um único asset pelo seu id no banco.",
    )
    parser.add_argument(
        "--log-dir",
        default=None,
        help=(
            "Pasta onde o arquivo de log será gravado. "
            "Padrão: subpasta 'logs/' no mesmo diretório do script."
        ),
    )
    parser.add_argument(
        "--notification-hook",
        default=None,
        help="URL para envio de notificação via POST ao final da execução quando novos CVEs forem identificados."
    )

    args = parser.parse_args()

    log_dir = Path(args.log_dir) if args.log_dir else _SCRIPT_DIR / "logs"

    executar_scan(args.db, args.asset_id, args.notification_hook, log_dir)
