"use strict";
S.sessao ? (S.sessao.usuario.trocar ? S.telaTrocarSenha(true) : S.iniciar()) : S.telaLogin();
