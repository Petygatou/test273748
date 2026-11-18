# Grau: como rodar

Precisa do Node 22 ou mais novo e de internet.

```
npm i
npm run dev
```

- `npm i` instala three, gsap, lenis, optician-sans e vite nas versões travadas e baixa a fonte Satoshi do Fontshare para `public/fonts/` (a licença não deixa a fonte vir junto no pacote). Se o download falhar, ele mostra como baixar à mão e o site abre com a fonte do sistema até lá.
- `npm run dev` abre em http://localhost:5181
- `npm run build` gera a pasta `dist/`, que sobe em qualquer hospedagem estática (Vercel, Netlify, Hostinger).

O guia do projeto é o `CLAUDE.md` (o mesmo que o `AGENTS.md`). Os prints de como cada cena deve ficar estão em `arquivos/conceito/`, e os prompts que geraram as fotos estão em `arquivos/receitas/`.
