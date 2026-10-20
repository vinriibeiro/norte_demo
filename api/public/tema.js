try{if(localStorage.getItem("seven_tema")==="escuro")document.documentElement.dataset.tema="escuro"}catch(e){}
/* logo que não carregar fica escondida (sem script inline, exigência da política de segurança) */
document.addEventListener("error",function(e){var t=e.target;if(t&&t.tagName==="IMG"&&/logo-[ce]/.test(t.className))t.style.display="none"},true);
/* fonte Inter carregada sem travar a abertura da tela (até chegar, o sistema usa a fonte do aparelho) */
try{var l=document.createElement("link");l.rel="stylesheet";l.href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap";document.head.appendChild(l)}catch(e){}
