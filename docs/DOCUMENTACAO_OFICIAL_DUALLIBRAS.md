# DualLibras.AI - Documentação Científica e Técnica Definitiva

Este documento descreve exaustivamente a arquitetura, o fluxo de dados, a infraestrutura e o design visual do projeto **DualLibras.AI**. O objetivo desta documentação é sanar qualquer possível questionamento técnico ou metodológico de bancas avaliadoras, comprovando a robustez científica da aplicação.

---

## 1. Visão Geral do Sistema e Arquitetura

O DualLibras.AI é um sistema distribuído baseado na arquitetura **Client-Server**, focado no paradigma de processamento de áudio em tempo real para acessibilidade de surdos em salas de aula.
- A comunicação entre o cérebro do sistema (Backend) e a interface (Frontend) é mantida ininterruptamente via protocolo **WebSocket (WS)**, o que anula o overhead do HTTP tradicional e atinge latências na casa dos milissegundos.
- A aplicação é modular, escalável e preparada para conteinerização (Docker).

---

## 2. Especificações do Backend (Motor Lógico e de Inteligência Artificial)

O Backend atua como a espinha dorsal de captura de hardware, filtragem de sinais digitais e processamento de linguagem natural (NLP).

### 2.1. Stack Tecnológico Base
- **Linguagem**: Python 3.10+
- **Framework de Servidor Web**: `FastAPI` (escolhido por seu suporte nativo a tipos `Pydantic` e performance equiparável ao Node.js) rodando sob o servidor ASGI `Uvicorn` na porta `5455`.
- **Comunicação Assíncrona**: Biblioteca `asyncio` rodando loops ininterruptos que evitam o travamento (blocking) das requisições REST durante o fluxo contínuo de áudio.

### 2.2. Captura e Filtragem Digital de Áudio
- A biblioteca `sounddevice` se conecta diretamente à interface ALSA/PulseAudio do sistema operacional (hardware-level).
- O áudio é gravado em blocos crus (*Raw PCM chunks*) usando Sample Rate de `16.000 Hz` (formato ideal exigido por redes neurais acústicas), em apenas `1 canal` (mono) para eficiência de rede.
- **Detecção Computacional de Fala (WebRTC VAD)**:
 - O algoritmo passa o sinal de áudio pelo Voice Activity Detection do WebRTC.
 - Para resistir ao ruído extremo de ambientes escolares (ventiladores, conversas), ele opera no `Mode 3` (Agressividade matemática máxima).
 - O `Energy Threshold` de RMS (Root Mean Square) é ajustado rigorosamente para barrar frequências de fundo, liberando o processamento apenas quando detecta a força vocal (threshold de 500) do microfone principal.

### 2.3. Modelos de Transcrição (Speech-to-Text Híbrido)
O sistema conta com tolerância a falhas (Fault Tolerance) de Nível 1.
1. **Modelo Primário (Cloud Real-time)**: API WebSocket do provedor AssemblyAI.
 - Rede neural utilizada: **Universal-3 Real-Time Pro (`u3-rt-pro`)**.
 - Otimização via Engenharia de Prompt: O modelo é pré-instruído dinamicamente a focar no "Português do Brasil, jargões escolares, vocabulário acadêmico", elevando a precisão contextual.
2. **Modelo Fallback (Local Offline)**: `faster-whisper`.
 - Caso o backend detecte queda de pacotes (via Probe de conectividade `1.1.1.1` porta `53`), o servidor transiciona sem quebrar a aplicação para o processamento offline.
 - Utiliza o modelo **`base` da OpenAI** comprimido pelo motor CTranslate2, que traduz áudio com alta resiliência via CPU ou GPU.

### 2.4. Persistência de Dados (File System)
- A classe interna `TranscriptManager` orquestra o banco de dados local.
- Usando a biblioteca `ReportLab`, o backend gera dinamicamente documentos **PDF** em milissegundos com tipografia formatada e carimbos de tempo (Timestamps).
- O histórico é salvo em redundância em três formatos: `.PDF` (foco humano), `.TXT` (foco em leveza), `.JSON` (foco em sistema e metadados lógicos).

---

## 3. Especificações do Frontend (UI/UX e Acessibilidade)

O Frontend é um processador ativo que reage aos dados e injeta código dinâmico de acessibilidade, além de prover uma interface gráfica robusta.

### 3.1. Stack Tecnológico Base
- **Ecossistema**: React.js (v19) compilado via construtor `Vite`.
- **Linguagem**: TypeScript, prevenindo erros crônicos de estado em "Runtime" através de tipagem forte.
- **Design System**: `Tailwind CSS v4`. A estilização emprega o paradigma **Glassmorphism**, com cálculos de GPU para `backdrop-blur`, gradientes transparentes e sombras luminescentes (drop-shadows). Ícones vetoriais modernos foram implementados com a biblioteca leve `lucide-react`.

### 3.2. A Interface Gráfica de Acessibilidade Visual
- **Diarização Baseada em Cores**:
 - O cliente React intercepta o Payload do WebSocket e valida a chave `activeSpeaker`.
 - Se for um **"Aluno"**, o React altera dinamicamente os Dropshadows, gradientes, bordas radiais e a luz indicadora (dot) para a paleta **Âmbar/Laranja (`#FFB042`)**.
 - Se for o **"Professor"**, o tema retorna instantaneamente para a cor primária **Ciano/Azul Ciel (`#82E3FF`)**.
 - Essa mecânica (Feedback Sensorial) garante ao espectador surdo a distinção imediata de quem tem o domínio da fala no ambiente escolar.
- **Animações Cinematográficas**: A apresentação das palavras lida com blocos de CSS `@keyframes text-reveal`. Cada atualização do `textoExibido` cria uma movimentação condicional no Eixo Y de `12px` removendo filtros de `blur` progressivamente, simulando letreiros em 60fps sem sobrecarga da DOM.
- **Modo Projetor (Focus Mode)**: O estado da interface (`useState`) remove seletivamente componentes auxiliares da árvore da DOM, gerando uma tela limpa e imersiva adaptada exclusivamente a Datashows escolares, isolando apenas a Legenda e o Avatar 3D.

### 3.3. Injeção e Controle do Motor VLibras
- O Widget open-source do LARI-UFPB (Governo Federal) é importado via script externo CDN e injetado via Shadow-DOM.
- O CSS da aplicação aplica restrições estruturais fortes (`!important`) ocultando menus redundantes nativos do Governo e integrando o Avatar ao layout translúcido da aplicação de forma contínua.

### 3.4. NLP de Simplificação Semântica (Linguística Computacional)
- Desenvolvido em `services/simplify.ts`.
- Antes de injetar frases no dicionário do VLibras, o script roda instâncias de `Expressões Regulares (RegEx)` no front-end.
- Palavras-chave longas e estruturalmente complexas (ex: "Entretanto", "Contudo", "Transmissão") são condensadas semanticamente para formas primitivas (ex: "Mas", "Fala").
- O impacto deste filtro é massivo, pois elimina comportamentos erráticos do avatar ao processar conectivos acadêmicos difíceis.

---

## 4. Comunicação de Redes, APIs e Endpoints

### 4.1. Payload do WebSocket Bi-Direcional
O tráfego principal opera na URL `ws://localhost:5455/ws`. O servidor e o cliente trocam strings JSON com a seguinte topologia estrita:
```json
{
 "type": "transcript",
 "text": "O exemplo prático da molécula de oxigênio.",
 "isFinal": true,
 "error": false,
 "speaker": "Professor"
}
```

### 4.2. API RESTful Secundária
Para persistência e consultas frias, o servidor expõe rotas HTTP assíncronas:
- `GET /health` : Verificador de tempo de inatividade da rede.
- `GET /transcripts` : Compila e retorna uma matriz iterável de todos os metadados e caminhos de arquivos salvos (`pdfs`, `texts`).
- `POST /save-transcript` : Recebe o cache de texto serializado da sessão do Frontend (`sessionStorage`) e comanda a operação I/O local de salvamento no disco.
- `GET /transcripts/download/{filename}` : Rota dedicada de entrega de *Static Files* para downloads imediatos nos navegadores.
- `GET /documentation/generate` : Script que dispara dinamicamente um *Walker* na estrutura local para gerar PDFs da arquitetura subjacente.

---

## 5. Requisitos Operacionais (Deployment)
O sistema exige controle rígido através do arquivo ambiental de execução `.env`:
- **Resistência a Ruído Ambiental**: `USE_WEBRTC_VAD=1`, `VAD_MODE=3`, `VAD_ENERGY_THRESHOLD=500`.
- **Seleção Dinâmica de Interface de Áudio**: Variáveis booleanas (`LIST_AUDIO_DEVICES=1`) acionam a exploração e injeção do ID manual do microfone otimizado via hardware (`AUDIO_DEVICE=X`).
- **Tolerância Offline**: Força o fallback local com a instrução `LOCAL_FALLBACK_MODEL=base`.
