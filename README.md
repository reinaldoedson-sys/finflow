# FinFlow

FinFlow é um aplicativo de gestão de finanças pessoais progressivo (PWA) projetado com foco em privacidade, velocidade e autonomia. Seus dados financeiros residem primariamente no dispositivo do usuário através do IndexedDB local, com suporte a sincronização em nuvem opcional com o Firebase/Firestore.

---

## 🛠️ Stack Tecnológica

Baseado estritamente nas tecnologias e dependências presentes no projeto:

- **Frontend & Core:** [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/)
- **Build Tool & Dev Server:** [Vite 8](https://vitejs.dev/)
- **Estilização:** [Tailwind CSS 4](https://tailwindcss.com/)
- **Armazenamento Local:** [Dexie.js](https://dexie.com/) (wrapper sobre IndexedDB)
- **PWA & Offline:** [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) com Workbox
- **Nuvem & Sincronização:** [Firebase](https://firebase.google.com/) (Authentication & Cloud Firestore - opcional)
- **Ícones & Animações:** [Lucide React](https://lucide.dev/), [Motion](https://motion.dev/)
- **Testes & Execução:** [tsx](https://github.com/privatenumber/tsx), [fake-indexeddb](https://github.com/dumbmatter/fake-indexeddb)

---

## 🚀 Como Rodar o Projeto

### 1. Instalar dependências
```bash
# Com npm:
npm install

# Ou com bun (lockfile fornecido):
bun install
```

### 2. Executar em desenvolvimento
Inicia o servidor de desenvolvimento na porta 3000:
```bash
npm run dev
```
Acesse `http://localhost:3000` no seu navegador.

### 3. Verificação de tipos (Lint)
Executa a validação estática do compilador TypeScript (com modo `strict` ativado para todo o projeto):
```bash
npm run lint
```

### 4. Executar testes automatizados
Roda toda a suíte de testes unitários e de integração com tsx:
```bash
npm test
```

### 5. Compilar para produção
Gera o bundle estático otimizado e o Service Worker na pasta `dist/`:
```bash
npm run build
```

### 6. Visualizar a versão compilada
Inicia o servidor local de pré-visualização dos arquivos em `dist/`:
```bash
npm run preview
```

---

## ⚙️ Variáveis de Ambiente

As variáveis configuráveis no arquivo `.env` (baseado no `.env.example`) são:

- `VITE_QUOTES_API_URL`: URL base para a API de cotações de mercado (opcional). Se não for definida, o cliente utiliza por padrão o endpoint local `/api/quotes`.

---

## 👥 Contas e Dados Locais

O FinFlow opera com arquitetura local-first e isolamento de dados entre contas no mesmo dispositivo:

- **Dados criados sem login:** Lançamentos e configurações criados localmente antes de qualquer autenticação sobem automaticamente para a primeira conta Google que fizer login no aparelho.
- **Registro do dono local (`finflow_local_owner`):** O navegador registra no `localStorage` a chave `finflow_local_owner` com o UID da conta à qual os dados locais pertencem.
- **Entrada com outra conta:** Ao fazer login com uma conta Google diferente da registrada no aparelho, o app não sincroniza nada com a nuvem e exibe um modal de segurança com três opções:
  - **"Baixar backup antes":** Abre o modal de backup para exportar e baixar os dados locais antes de qualquer alteração;
  - **"Continuar e apagar dados locais":** Limpa o IndexedDB financeiro, a fila de sincronização e as chaves de dados do `localStorage`, registra o UID da nova conta como proprietário e recarrega a página;
  - **"Cancelar e sair":** Desconecta a nova conta imediatamente sem tocar nos dados locais pré-existentes.
- **Fila de sincronização protegida:** Itens pendentes na fila guardam o `ownerUid` e só são enviados para a conta que os criou. Operações de outra conta permanecem retidas e não são enviadas nem removidas.
- **Logout:** O logout encerra a sessão remota, mas **NÃO apaga os dados locais** armazenados no IndexedDB do aparelho.

---

## 📁 Estrutura de Pastas

- `src/domain`: Modelos de domínio, entidades financeiras, regras de cálculo e definições de tipos.
- `src/repositories`: Camada de acesso a dados e repositórios locais IndexedDB/Dexie.
- `src/services`: Serviços de sincronização (Firestore), cotações de mercado, regras de negócio e importação/exportação.
- `src/storage`: Esquema do banco de dados local Dexie, índices e versionamento de migrações.
- `src/context`: Gerenciamento de estado global com React Context (`FinanceContext`, `SecurityContext`).
- `src/views`: Telas e visões completas da aplicação (Dashboard, Transações, Metas, Investimentos, Orçamentos, Configurações).
- `src/components`: Componentes reutilizáveis da interface, formulários, modais e banners informativos.
- `server`: Módulos de servidor independentes, como provedor de cotações com normalização e cache em memória.
- `test`: Suíte de testes automatizados e cenários de validação executados diretamente com `tsx`.

---

## 🔒 Segurança

- **Bloqueio por PIN:** O aplicativo oferece um bloqueio de tela local por PIN de 4 dígitos. A proteção é garantida utilizando a Web Crypto API nativa com PBKDF2-SHA256 (210.000 iterações e salt aleatório de 16 bytes gerado por instalação), comparado em tempo constante e com bloqueio temporal progressivo após tentativas incorretas.
- **Dados Locais:** Os dados financeiros armazenados localmente no IndexedDB **não são criptografados em repouso**, dependendo da segurança de isolamento por origem (same-origin policy) e das proteções do sistema operacional do dispositivo do usuário.
- **Backup & Exportação:** O arquivo de backup exportado pode ser criptografado pelo usuário com senha personalizada utilizando o algoritmo AES-GCM 256. Os backups novos utilizam o formato versionado `FFB1` com 600.000 iterações de PBKDF2-SHA256, cabeçalho autenticado via `additionalData` (garantindo que adulterações no número de iterações, salt ou magic number invalidem a decriptação) e validação de limites de iterações (entre 100.000 e 5.000.000), mantendo compatibilidade transparente com backups no formato legado (100.000 iterações, sem cabeçalho).

---

## 📈 Cotações

O endpoint de cotações de mercado (`/api/quotes`) hoje é fornecido como um middleware no servidor de desenvolvimento Vite (`server/quotes.ts`). Em ambientes de produção estáticos, a variável `VITE_QUOTES_API_URL` pode ser configurada para apontar para um serviço ou função externa que forneça as cotações no mesmo formato.

---

## 📝 Notas de Desenvolvimento

O TypeScript está fixado na versão `~6.0.3` (série 6.0.x) porque o `typescript-eslint` ainda não possui suporte estável ao TypeScript 7; essa versão deve ser reavaliada para atualização assim que o suporte oficial for disponibilizado pelo ecossistema.

