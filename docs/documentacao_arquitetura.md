# Documentação Técnica de Arquitetura — DualLibras.AI

Este documento descreve detalhadamente a arquitetura do sistema, o fluxo de dados, as tecnologias utilizadas e o funcionamento interno de cada módulo do **DualLibras.AI**.


## 1. Stack Tecnológico

A tabela abaixo descreve as tecnologias utilizadas em cada camada do sistema:

| Camada | Tecnologia | Papel no Sistema |
| - | - | - |
| **Frontend** | **React 19 + Vite** | SPA (Single Page Application) responsiva e de alta performance. |
| | **TypeScript** | Tipagem estática para maior segurança e qualidade do código. |
| | **Tailwind CSS v4** | Estilização moderna e responsiva (estilo escuro glassmorphism). |
| | **VLibras Gov Widget** | Widget oficial brasileiro com avatar 3D para tradução de Libras. |
| **Backend** | **FastAPI (Python)** | Framework assíncrono para a API REST e servidor WebSocket. |
| | **Uvicorn** | Servidor ASGI para rodar a aplicação FastAPI com alta performance. |
| | **SoundDevice + NumPy** | Captura do microfone local e processamento matemático de arrays de áudio. |
| **Motores de IA** | **AssemblyAI v3 API** | Reconhecimento de fala em tempo real de altíssima acurácia (Nuvem). |
| | **Faster-Whisper** | Transcritor local leve com otimização C2Translate (Fallback local). |
| | **WebRTC VAD** | Detetor de Atividade de Voz do Google WebRTC compilado para Python. |
| **Documentos** | **ReportLab** | Biblioteca Python para geração programática de PDFs estilizados. |
| **Container** | **Docker & Compose** | Padronização do ambiente e facilitação do deploy em produção. |
| | **Nginx** | Reverse Proxy para roteamento do WebSocket `/ws` e arquivos estáticos. |



## 2. Visão Geral da Arquitetura

O sistema é baseado em uma **arquitetura híbrida cliente-servidor (Edge-to-Cloud)**. Ele funciona de forma integrada através de fluxos bidirecionais contínuos:

```
 
 Microfone (Professor) 
 
 (Áudio PCM 16kHz) 
 
 
 BACKEND (FastAPI) 
 
 1. Captura de Áudio (SoundDevice) 
 2. Filtro VAD (WebRTC / RMS Energy) 
 
 Internet? 
 SIM Na Nuvem 
 
 
 AssemblyAI Whisper 
 (Streaming) (Local) 
 
 
 
 
 Texto Transcrito 
 
 (WebSockets) 
 
 
 FRONTEND (React) 
 
 1. Exibição da Legenda (App.tsx) 
 2. Simplificação Textual (simplify.ts) 
 3. Animação do Avatar 3D (VLibras) 
 
```


## 3. Funcionamento Interno Passo a Passo

### Passo 1: Captura e Tratamento de Áudio

O backend inicia um stream contínuo de captura de áudio direto da placa de som padrão utilizando o `sounddevice.RawInputStream`.

- **Configuração de captura**: Frequência de amostragem de **16.000 Hz**, canal **Mono**, formato **PCM de 16-bit** (16 bits por amostra). Esse formato padrão é exigido tanto pelo AssemblyAI quanto pelo Whisper.

- **Tamanho de bloco (chunk)**: O áudio é lido em pequenos blocos de **50ms** (1600 bytes) para garantir baixa latência.

### Passo 2: Detecção de Atividade de Voz (VAD)

Para funcionar em **salas de aula barulhentas**, o sistema não envia o áudio continuamente para a IA. O bloco de áudio passa por um filtro VAD (`VoiceActivityDetector`):

- **Modo WebRTC**: Classifica o áudio em 4 níveis de agressividade (0 a 3). No modo `3` (máxima agressividade), o algoritmo filtra ruídos contínuos como ventiladores e ar-condicionado, ativando o envio apenas quando há alta probabilidade de fala humana.

- **Modo RMS (Fallback de Energia)**: Caso o WebRTC VAD falhe, o sistema calcula a energia quadrática média (Root-Mean-Square - RMS) das amostras de áudio. Se a energia estiver abaixo do `VAD\_ENERGY\_THRESHOLD` (ex: 300), o bloco é descartado como silêncio, economizando banda de internet e processamento de IA.

- **Silêncio de segurança (Hold Silence)**: O VAD mantém o envio de dados por um curto período (ex: 240ms) após o professor parar de falar. Isso evita que pequenas pausas naturais entre palavras cortem a frase no meio.

### Passo 3: Transcrição em Tempo Real (Duplo Pipeline)

#### Pipeline A: Modo Online (AssemblyAI)

Se a internet estiver ativa, os blocos de áudio validados pelo VAD são transmitidos via WebSocket seguro (`wss://streaming.assemblyai.com/v3/ws`) para o AssemblyAI.

- **Diarização (Diferenciação de Vozes)**: Ao enviar o parâmetro `speaker\_labels=true`, a rede neural do AssemblyAI analisa a biometria vocal em tempo real e retorna no JSON qual locutor está falando (ex: `"speaker": "A"` ou `"speaker": "B"`).

- **Retorno da transcrição**: A API devolve dois tipos de respostas:

 1. *Parciais*: Frases que mudam rapidamente à medida que o locutor fala.

 2. *Finais*: A frase completa, pontuada e corrigida pela inteligência artificial.

#### Pipeline B: Modo Offline / Local (faster-whisper)

Se o validador de conexão (`is\_internet\_available`) detectar que a internet caiu, o backend ativa o fallback local:

- O áudio acumulado durante as janelas de fala ativa (VAD) é direcionado ao modelo local do **Whisper** (`tiny`, `base` ou `small`).

- **Segurança e Fluidez**: A inferência do Whisper roda em uma thread paralela utilizando `asyncio.to\_thread` para não congelar o servidor.

- O Whisper transcreve o bloco acumulado assim que o VAD detecta uma pausa na fala, enviando o texto final de forma imediata para o frontend.

### Passo 4: Transmissão Backend-Frontend

O backend mantém um conjunto ativo de conexões WebSocket com os clientes (`clientes: set\[WebSocket\]`). Cada transcrição gerada pelo pipeline ativo é formatada em um JSON contendo:

```
\{ 
 "type": "transcript", 
 "text": "Frase transcrita aqui", 
 "is\_final": true, 
 "speaker": "Palestrante A" 
\}
```

Esse payload é enviado para todos os clientes conectados.

### Passo 5: Normalização e Simplificação Textual (LPL)

Ao receber o texto, o frontend utiliza o módulo [simplify.ts](file:///home/phoenixdev/Documentos/programação/ProjetoFestival2026/client/src/services/simplify.ts) antes de enviar a frase para o avatar do VLibras.

- A gramática da Língua Brasileira de Sinais (Libras) foca na estrutura lógica direta (Sujeito-Objeto-Verbo) e descarta termos rebuscados do português formal.

- O algoritmo aplica substituições por Expressões Regulares (Regex) mapeando palavras prolixas para termos simples (ex: *no entanto/todavia* → *mas*, *utilizar* → *usar*, *fornecer* → *dar*).

- Também fatia sentenças excessivamente longas baseando-se em pontuações (vírgulas, dois-pontos), reduzindo a fila de tradução do avatar e garantindo sincronia visual entre a legenda e os sinais 3D.

### Passo 6: Animação do Avatar (VLibras Gov Widget)

O componente React [VLibras.tsx](file:///home/phoenixdev/Documentos/programação/ProjetoFestival2026/client/src/components/VLibras.tsx) carrega de forma assíncrona o script oficial do governo federal brasileiro.

- **Customizações Estéticas**: Como o widget padrão do VLibras adiciona botões flutuantes grandes, o componente executa um "hack" estrutural de CSS injetando propriedades `!important` para ocultar os controles padrões e centralizar apenas a figura do avatar em 3D de forma transparente na tela da aplicação.

- **Controle de Fila**: Um sistema de fila sequencial (`queue.current`) gerencia os envios de texto para o avatar, estimando o tempo de animação de cada frase para evitar que uma frase nova interrompa a sinalização da anterior no meio da animação.

### Passo 7: Persistência de Transcrições (ReportLab)

Quando a aula se encerra ou quando o usuário clica em "Salvar Aula", o frontend faz uma chamada HTTP REST para `POST /save-transcript` contendo o texto completo compilado com marcadores de palestrantes.

- O backend aciona o `TranscriptManager`, que cria pastas estruturadas (`output/transcripts/pdfs`, `output/transcripts/texts`, `output/transcripts/metadata`).

- A biblioteca **ReportLab** é invocada. Ela registra fontes TrueType locais compatíveis com caracteres especiais (como DejaVuSans ou LiberationSans), define folhas de estilo tipográficas e gera um documento PDF profissional com margens, cabeçalho dinâmico e rodapé de metadados.


## 4. Parâmetros Críticos para Ambientes Barulhentos

Para o correto funcionamento em **salas de aula reais com ruído de fundo**, estes são os parâmetros mais importantes configurados no arquivo `.env` do backend:

1. **`VAD\_MODE=3` (Máxima Agressividade)**

 - Configura o WebRTC VAD para ser o mais restritivo possível. O algoritmo de detecção de probabilidade de voz de banda estreita ignorará ruídos como batidas de porta, sussurros distantes e barulho de tráfego, capturando apenas a fala limpa próxima ao microfone.

2. **`VAD\_ENERGY\_THRESHOLD=350` ou `400`**

 - Aumenta a barreira de volume mínima no modo de fallback. Evita que o Whisper offline tente transcrever barulhos estáticos constantes (como zumbidos elétricos ou som de ventiladores próximos).

3. **`VAD\_HOLD\_SILENCE\_MS=300`**

 - Aumenta ligeiramente a janela de retenção. Em ambientes barulhentos, o professor pode falar de forma mais pausada devido à acústica da sala. Manter o canal aberto por 300ms garante que as palavras não fiquem fragmentadas em arquivos de áudio separados.

4. **`LOCAL\_FALLBACK\_MODEL=base` ou `small`**

 - Em salas barulhentas, o modelo `tiny` do Whisper local pode cometer muitos erros fonéticos pela falta de clareza do áudio. O modelo `base` ou `small` oferece maior resistência a ruídos devido à sua quantidade muito superior de parâmetros neurais.

