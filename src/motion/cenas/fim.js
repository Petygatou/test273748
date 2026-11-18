// O fim: formulário e rodapé num painel de vidro fosco que sobe por cima do palco. O vidro é o mesmo desfoque
// do site (a composição desfoca a camada de leitura dentro do retângulo do painel). O estojo fechado pousa
// na borda de cima do painel e sobe com ele (o diretor segue a vaga).
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { EASE } from '../ease.js';
import { entra, sai, mascara } from '../ui.js';

export function fim(ctx) {
  const painel = document.querySelector('.fim__painel');
  const form = painel.querySelector('.agenda');
  const ok = form.querySelector('.agenda__ok');
  const titulo = form.querySelector('.agenda__titulo');
  const blocos = [form.querySelector('.agenda__sub'), ...form.querySelectorAll('.campos, .escolha, .pilula--cheia')];
  titulo.innerHTML = `<span class="mascara"><span>${titulo.innerHTML}</span></span>`;
  const vidro = { x: 0, y: 0, w: 0, h: 0, raio: 34, opac: 0, desfoque: 5.9, brilho: 1 };
  ctx.palco.estado.paineis = [vidro];

  gsap.set(blocos, { opacity: 0, y: 18 });
  ScrollTrigger.create({
    trigger: form,
    start: 'top 82%',
    onEnter: () => {
      entra(titulo);
      gsap.to(blocos, { opacity: 1, y: 0, duration: 0.9, ease: EASE.out, stagger: 0.07, delay: 0.15, overwrite: true });
    },
    onLeaveBack: () => {
      sai(titulo);
      gsap.to(blocos, { opacity: 0, y: 18, duration: 0.3, ease: EASE.in, overwrite: true });
    },
  });

  // estados do formulário: foco (CSS), preenchido, erro (o rótulo vira a mensagem) e enviado (o formulário sai de foco)
  const campos = [...form.querySelectorAll('.campo')];
  const botao = form.querySelector('.pilula--cheia span');
  for (const c of campos) {
    const input = c.querySelector('input'), rot = c.querySelector('span');
    input.addEventListener('input', () => {
      c.classList.toggle('preenchido', input.value.trim() !== '');
      if (c.classList.contains('erro')) { c.classList.remove('erro'); rot.textContent = rot.dataset.rotulo; input.setAttribute('aria-invalid', 'false'); }
    });
  }
  const erro = (c, msg) => {
    c.classList.add('erro');
    c.querySelector('span').textContent = msg;
    c.querySelector('input').setAttribute('aria-invalid', 'true');
  };
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (form.classList.contains('enviada')) return;
    const [cNome, cZap] = campos;
    const nome = cNome.querySelector('input').value.trim();
    const digitos = cZap.querySelector('input').value.replace(/\D/g, '');
    let ok_ = true;
    if (!nome) { erro(cNome, 'Falta o seu nome'); ok_ = false; }
    if (digitos.length < 10) { erro(cZap, 'WhatsApp com DDD, só números'); ok_ = false; }
    if (!ok_) { ok.textContent = ''; (form.querySelector('.campo.erro input'))?.focus(); return; }
    const dia = form.querySelector('[name="dia"]:checked + span').textContent;
    const per = form.querySelector('[name="periodo"]:checked + span').textContent.toLowerCase();
    form.classList.add('enviada');
    botao.textContent = 'Agendado';
    ok.textContent = `Pronto, ${nome.split(' ')[0]}. A gente chama no WhatsApp para confirmar ${dia}, de ${per}.`;
    gsap.fromTo(ok, { opacity: 0, filter: 'blur(8px)' }, { opacity: 1, filter: 'blur(0px)', duration: 0.9, ease: EASE.out });
  });

  return {
    marcos: [],
    vai() {},
    quadro() {
      const r = painel.getBoundingClientRect();
      vidro.x = r.left; vidro.y = r.top; vidro.w = r.width; vidro.h = r.height;
      vidro.opac = r.top < innerHeight && r.bottom > 0 ? 1 : 0;
    },
  };
}
