# Frontend — DualLibras.AI

Interface web do projeto DualLibras.AI, construída com **React + TypeScript + Vite**.

---

## Requisitos

- Node.js 18+
- npm

---

## Instalação

```bash
npm install
```

## Rodando em desenvolvimento

```bash
npm run dev
```

Acesse em: [http://localhost:5173](http://localhost:5173)

> O backend deve estar rodando em `ws://localhost:8888` para a transcrição funcionar.

---

## Estrutura

```
src/
├── App.tsx               # Componente principal
├── components/
│   └── VLibras.tsx       # Integração com o widget VLibras
└── services/
    └── websocket.ts      # Comunicação WebSocket com o backend
```

---

## Plugins Vite disponíveis

- [`@vitejs/plugin-react`](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) — usa [Oxc](https://oxc.rs/)
- [`@vitejs/plugin-react-swc`](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) — usa [SWC](https://swc.rs/)

## React Compiler

O React Compiler não vem ativado por padrão devido ao impacto na performance de dev e build. Para habilitá-lo, consulte a [documentação oficial](https://react.dev/learn/react-compiler/installation).

---

## ESLint

Para habilitar regras com verificação de tipos em produção, atualize o `eslint.config.js`:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      tseslint.configs.recommendedTypeChecked,
      // ou mais estrito:
      tseslint.configs.strictTypeChecked,
      // opcional — regras de estilo:
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
])
```

Também é recomendado instalar os plugins [`eslint-plugin-react-x`](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) e [`eslint-plugin-react-dom`](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom):

```js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      reactX.configs['recommended-typescript'],
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
])
```
