# RachaFácil — Pacote Pronto para Deploy no Netlify

Este pacote contém todos os arquivos necessários para publicar o aplicativo **RachaFácil** no **Netlify**.

## Como colocar no ar no Netlify:

### Opção 1: Via GitHub (Recomendado)
1. Suba todos os arquivos desta pasta para um repositório no seu GitHub.
2. No painel do **Netlify**, clique em **"Add new site" > "Import an existing project"** e selecione o repositório.
3. O arquivo `netlify.toml` já configurará automaticamente o comando `npm run build` e a pasta `dist`.

### Opção 2: Rodando no seu computador e arrastando a pasta `dist`
1. Abra o terminal nesta pasta e instale as dependências:
   ```bash
   npm install
   ```
2. Gere a versão otimizada de produção:
   ```bash
   npm run build
   ```
3. Arraste a pasta **`dist`** gerada diretamente para o painel do **Netlify** (Deploy manually).
