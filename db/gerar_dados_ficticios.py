"""
Gera db/38_dados_ficticios.sql: equipes, usuários, vendas, rota, faturas (FPD), pendências
e viabilidades FICTÍCIOS para a demonstração. Nenhum dado real.

Uso:  python db/gerar_dados_ficticios.py > db/38_dados_ficticios.sql
Senha de todos os usuários fictícios: Demo@2026
"""
import random
from datetime import date, timedelta

R = random.Random(20261020)
HOJE = date(2026, 10, 20)
INICIO = date(2026, 5, 1)
SENHA = "Demo@2026"

def q(s):
    """literal SQL seguro"""
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"

def dt(d):
    return q(d.isoformat()) if d else "NULL"

NOMES = ['Bruno','Camila','Diego','Elaine','Felipe','Gabriela','Henrique','Isabela','João','Karen','Leandro','Mariana',
         'Nelson','Olívia','Pedro','Quésia','Renato','Sabrina','Gustavo','Vanessa','Wagner','Yasmin','Zeca','Aline',
         'Bernardo','Daniela','Eduardo','Helena','Igor','Lorena']
SOBRE = ['Almeida','Barbosa','Cardoso','Dias','Esteves','Fonseca','Garcia','Moreira','Nunes','Pereira','Queiroz',
         'Rocha','Silveira','Vieira','Xavier','Batista','Campos','Freitas']
CLIENTES_N = ['Antônio','Beatriz','Cláudio','Lúcia','Eliane','Fábio','Graziela','Heitor','Joaquim','Kátia','Lucas',
              'Marta','Nilton','Paula','Raimundo','Sônia','Tadeu','Vera']
RUAS = ['das Acácias','das Palmeiras','Sete de Setembro','dos Ipês','Santa Luzia','das Flores','Primavera','do Comércio']
BAIRROS = ['Centro','Jardim Esperança','Vila Nova','Bela Vista','Parque Verde','São Jorge']
EQUIPES = ['Equipe Centro','Equipe Norte','Equipe Sul','Equipe Litoral','Equipe Serra']
EQ_ID0 = 101          # ids altos para não colidir com os cadastros de teste
USR_ID0 = 101
CLI_ID0 = 1

# catálogo de produtos (ids do 02_seed); pesos de venda
PRODUTOS = {  # id: (peso, preço_ref_fallback)
    9: 0.10, 10: 0.10, 11: 0.12, 12: 0.16, 13: 0.10, 14: 0.05, 15: 0.07,   # internet
    1: 0.05, 4: 0.05, 6: 0.04, 5: 0.02,                                  # TV, fone, mesh
    17: 0.02, 18: 0.02, 21: 0.02, 22: 0.02,                               # móvel
}
MOVEL = {17, 18, 19, 20, 21, 22, 23, 24, 25, 26}

def turno_de(h):
    if h < 12:
        return '08:00 AS 12:00'
    if h < 15:
        return '12:00 AS 15:00'
    return '15:00 AS 18:00'

def sorteia_produto():
    x, acc = R.random(), 0
    for pid, w in PRODUTOS.items():
        acc += w
        if x < acc:
            return pid
    return 9

# ---------- usuários ----------
usuarios = []   # dicts
def novo_usuario(nome, perfil, funcoes, setor=None, qualidade=None, inicio=None):
    i = len(usuarios)
    uid = USR_ID0 + i
    login = nome.lower().replace(' ', '.')
    usuarios.append(dict(id=uid, login=login, nome=nome, perfil=perfil, funcoes=funcoes, setor=setor,
                         qualidade=qualidade, inicio=inicio))
    return usuarios[-1]

coord = novo_usuario('Marcos Antônio Vidal', 'coordenador', ['COORDENADOR'], inicio=date(2026, 1, 5))
lideres = [novo_usuario(f'{R.choice(NOMES)} {R.choice(SOBRE)} Lider', 'lider', ['LIDER'], inicio=date(2026, 2, 2))
           for _ in EQUIPES]
bko_cad = [novo_usuario(f'Patrícia {s} Cadastro', 'backoffice', ['BACKOFFICE'], setor='CADASTRO',
                        inicio=date(2026, 1, 12)) for s in ('Lima', 'Teixeira')]
bko_qual = [novo_usuario('Roberto Sales Qualidade', 'backoffice', ['BACKOFFICE'], setor='QUALIDADE',
                         inicio=date(2026, 1, 12))]
vendedores = []
for i in range(30):
    nome = f'{NOMES[i]} {SOBRE[(i * 5) % len(SOBRE)]}'
    entrada = date(2026, 8, 10) if i >= 26 else date(2026, 4, 1)
    v = novo_usuario(nome, 'vendedor', ['VENDEDOR'], inicio=entrada)
    v.update(equipe=i % 5, meta=R.randint(18, 34), ritmo=0.22 + R.random() * 0.36,
             qual=0.04 + R.random() * 0.38,
             parado=date(2026, 10, 15) if i == 4 else (date(2026, 10, 17) if i == 17 else None))
    vendedores.append(v)

# ---------- vendas ----------
contratos, itens, faturas, agenda, confirmacoes, clientes = [], [], [], [], [], []
seq_contrato = 1
seq_item = 1
seq_fatura = 1
seq_agenda = 1
seq_conf = 1
cidades = [(1, 'RIO BRANCO', 'AC'), (2, 'PORTO VELHO', 'RO'), (3, 'ARIQUEMES', 'RO'), (4, 'JI-PARANÁ', 'RO'),
           (5, 'FORMOSA', 'GO'), (6, 'PLANALTINA DE GOIÁS', 'GO'), (7, 'ÁGUAS LINDAS DE GOIÁS', 'GO'),
           (8, 'VALPARAÍSO DE GOIÁS', 'GO'), (9, 'CIDADE OCIDENTAL', 'GO'), (10, 'PLANALTINA', 'DF'),
           (11, 'BRASÍLIA', 'DF'), (12, 'CAMPO GRANDE', 'MS')]
BACKOFFICES = bko_cad

def dias(d0, d1):
    n = (d1 - d0).days
    for k in range(n + 1):
        yield d0 + timedelta(days=k)

for d in dias(INICIO, HOJE):
    fds = d.weekday() >= 5
    fechado = d < date(2026, 10, 1)
    for v in vendedores:
        if d < v['inicio']:
            continue
        if v['parado'] and d >= v['parado']:
            continue
        p = v['ritmo'] * (0.45 if fds else 1.0)
        k = 0
        while R.random() < p and k < 3:
            k += 1
            p *= 0.5
            h = R.randint(8, 18)
            cid = R.choice(cidades)
            cli_id = CLI_ID0 + len(clientes)
            tipo_pessoa = 'CPF'
            doc = f'9{R.randint(10**9, 10**10 - 1)}'[:11]
            clientes.append(dict(id=cli_id, nome=f'{R.choice(CLIENTES_N)} {R.choice(SOBRE)}', doc=doc,
                                 fone=f'(99) 9{R.randint(1000, 9999)}-{R.randint(1000, 9999)}'))
            u = R.random()
            if fechado:
                sit = 'ATIVO' if u < 0.90 else ('CANCELADO' if u < 0.96 else 'PENDENTE')
            else:
                sit = 'PENDENTE' if u < 0.32 else ('ATIVO' if u < 0.93 else 'CANCELADO')
            if sit == 'ATIVO':
                stc = 'CONECTADO'
            elif sit == 'CANCELADO':
                stc = 'CANCELADO'
            else:
                stc = None
            motivo = R.randint(1, 16) if sit == 'CANCELADO' else None
            origem = R.choice(['PAP', 'PAP', 'INDICAÇÃO', 'REDE SOCIAL', 'CARROSSEL'])
            canal = R.choice(['SISTEMA_C', 'SISTEMA_B'])
            tipo = 'PROSPECT' if R.random() < 0.7 else 'BASE'
            forma = 'DCC' if R.random() < 0.35 else 'BOLETO'
            turno = turno_de(h)
            cid_id = cid[0]
            num = f'DEMO{seq_contrato:07d}'
            # itens
            prods = [sorteia_produto()]
            if R.random() < 0.3:
                prods.append(sorteia_produto())
            prods = list(dict.fromkeys(prods))
            pacote = round(R.choice([99.9, 119.9, 139.9, 159.9, 179.9, 199.9]), 2)
            contratos.append(dict(
                id=seq_contrato, numero=num, cliente=cli_id, vend=v['id'], equipe=101 + v['equipe'],
                bko=R.choice(BACKOFFICES)['id'] if sit != 'CANCELADO' else None,
                data=d, origem=origem, canal=canal, tipo=tipo, forma=forma, dia_venc=R.randint(1, 28),
                st=sit, stc=stc, motivo=motivo, cidade=cid_id, bairro=R.choice(BAIRROS),
                endereco=f'Rua {R.choice(RUAS)}, {R.randint(10, 999)}', tipo_imovel=R.choice(['CASA', 'CASA', 'APT']),
                turno=turno, pacote=pacote, hora=h))
            for pid in prods:
                movel = pid in MOVEL
                itens.append(dict(id=seq_item, contrato=seq_contrato, produto=pid, qtd=1,
                                  adesao=R.choice(['LINHA_NOVA', 'LINHA_NOVA', 'PORTABILIDADE']) if movel else None,
                                  chip=f'8955{R.randint(10**10, 10**11 - 1)}' if movel else None,
                                  chip_ativo=(R.random() < 0.6) if movel else None))
                seq_item += 1
            # fatura nº 1 (base do FPD) — só para vendas ativas com prazo já vencido
            if sit == 'ATIVO' and d <= HOJE - timedelta(days=40):
                venc = d + timedelta(days=30)
                limite = venc + timedelta(days=5)
                qual = v['qual']
                x = R.random()
                if x < 1 - qual:
                    pag = venc - timedelta(days=R.randint(0, 6))           # em dia
                    sit_f = 'PAGA_NO_PRAZO'
                elif x < 1 - qual / 2:
                    pag = limite + timedelta(days=R.randint(1, 20))         # atrasou
                    sit_f = 'PAGA_FORA_DO_PRAZO'
                else:
                    pag = None                                              # não pagou
                    sit_f = 'NAO_PAGA'
                faturas.append(dict(id=seq_fatura, contrato=seq_contrato, venc=venc, limite=limite,
                                    valor=pacote, pag=pag, situacao=sit_f))
                seq_fatura += 1
            # rota de instalação
            if sit in ('ATIVO', 'PENDENTE') and d <= HOJE - timedelta(days=2):
                data_rota = d + timedelta(days=R.randint(2, 12))
                if data_rota <= HOJE:
                    y = R.random()
                    sit_a = 'INSTALADO' if y < 0.80 else ('CLIENTE_AUSENTE' if y < 0.88 else
                                                           ('REAGENDADO' if y < 0.95 else 'CANCELADO'))
                else:
                    sit_a = 'PENDENTE_INSTALACAO'
                if sit != 'PENDENTE' or sit_a != 'PENDENTE_INSTALACAO':
                    agenda.append(dict(id=seq_agenda, contrato=seq_contrato, data_rota=data_rota, turno=turno,
                                       situacao=sit_a, confirmada=(sit_a != 'PENDENTE_INSTALACAO'),
                                       bko=R.choice(BACKOFFICES)['id'],
                                       nota=R.randint(6, 10) if sit_a == 'INSTALADO' else None))
                    seq_agenda += 1
            # confirmação D1
            if sit == 'ATIVO' and d <= HOJE - timedelta(days=3):
                res = 'CONFIRMADO' if R.random() < 0.85 else ('NAO_ATENDEU' if R.random() < 0.7 else 'PROBLEMA')
                confirmacoes.append(dict(id=seq_conf, contrato=seq_contrato, etapa='D1', resultado=res,
                                         obs='Cliente confirmou a instalação' if res == 'CONFIRMADO' else None,
                                         por=R.choice(BACKOFFICES)['id'], em=d + timedelta(days=1)))
                seq_conf += 1
            seq_contrato += 1

# ---------- pendências, viabilidades, vendas externas ----------
pendencias = []
for i in range(60):
    v = R.choice(vendedores)
    tipo = R.choice(['PENDENCIA'] * 2 + ['CHIP_PENDENTE'] + ['CADASTRO_ANDAMENTO'])
    pendencias.append(dict(id=i + 1, tipo=tipo, vend=v['id'], bko=R.choice(BACKOFFICES)['id'],
                           data=HOJE - timedelta(days=R.randint(0, 25)),
                           cliente=f'{R.choice(CLIENTES_N)} {R.choice(SOBRE)}',
                           aberta=R.random() < 0.6, motivo=R.randint(1, 16),
                           desc='Aguardando documentação do cliente' if tipo == 'PENDENCIA' else
                                'Chip a ativar com o cliente' if tipo == 'CHIP_PENDENTE' else
                                'Cadastro em análise no caixa'))

viabs = []
for i in range(70):
    v = R.choice(vendedores)
    cid = R.choice(cidades)
    st = R.choice(['ATENDE'] * 5 + ['NAO_ATENDE'] * 2 + ['EM_ANALISE', 'PENDENTE'])
    criado = HOJE - timedelta(days=R.randint(0, 40))
    viabs.append(dict(id=i + 1, vend=v['id'], cep=f'{R.randint(10000000, 99999999)}',
                      logr=f'Rua {R.choice(RUAS)}', num=str(R.randint(10, 999)),
                      bairro=R.choice(BAIRROS), cidade=cid[1], uf=cid[2],
                      cliente=f'{R.choice(CLIENTES_N)} {R.choice(SOBRE)}', status=st,
                      criado=criado, resp=(criado + timedelta(days=1)) if st != 'PENDENTE' else None,
                      enc=R.choice(['SISTEMA_A', 'SISTEMA_B']), bko=R.choice(BACKOFFICES)['id']))

# ---------- SQL ----------
out = []
w = out.append
w("-- =====================================================================")
w("-- 38: dados FICTÍCIOS para demonstração (gerado por gerar_dados_ficticios.py).")
w("-- Nenhum dado real. Senha de todos os usuários fictícios: Demo@2026")
w("-- =====================================================================")
w("SET search_path = seven, public;")
w("")
w("-- equipes")
w("INSERT INTO equipe (id, nome, ativa) OVERRIDING SYSTEM VALUE VALUES")
w(",\n".join(f"  ({EQ_ID0 + i}, {q(n)}, true)" for i, n in enumerate(EQUIPES)) + ";")
w("")
w("-- usuários (todos com a mesma senha de demonstração)")
w("INSERT INTO usuario (id, login, nome_completo, email, perfil_acesso, setor, data_entrada, ativo, premiacao_tabela) OVERRIDING SYSTEM VALUE VALUES")
rows = []
for u in usuarios:
    rows.append(f"  ({u['id']}, {q(u['login'])}, {q(u['nome'])}, {q(u['login'] + '@demo.local')}, {q(u['perfil'])}, "
                f"{q(u['setor'])}, {dt(u['inicio'])}, true, 'PADRAO')")
w(",\n".join(rows) + ";")
w("")
w("INSERT INTO conta_acesso (usuario_id, senha_hash, deve_trocar_senha, ativa, falhas_login, token_versao)")
w(f"SELECT id, extensions.crypt({q(SENHA)}, extensions.gen_salt('bf', 10)), false, true, 0, 1")
w("FROM usuario WHERE id BETWEEN " + str(USR_ID0) + " AND " + str(USR_ID0 + len(usuarios) - 1) + ";")
w("")
w("INSERT INTO usuario_funcao (usuario_id, funcao) VALUES")
w(",\n".join(f"  ({u['id']}, {q(f)})" for u in usuarios for f in u['funcoes']) + ";")
w("")
w("INSERT INTO equipe_membro (equipe_id, usuario_id, inicio) VALUES")
w(",\n".join(f"  ({EQ_ID0 + v['equipe']}, {v['id']}, {dt(v['inicio'])})" for v in vendedores) + ";")
w("")
w("UPDATE equipe SET lider_id = CASE id " + " ".join(
    f"WHEN {EQ_ID0 + i} THEN {lideres[i]['id']}" for i in range(5)) + " END,")
w(f"  coordenador_id = {coord['id']}")
w(f"WHERE id BETWEEN {EQ_ID0} AND {EQ_ID0 + 4};")
w("")
w("-- clientes e contratos")
w("INSERT INTO cliente (id, tipo_pessoa, documento, nome, contato, criado_em) OVERRIDING SYSTEM VALUE VALUES")
w(",\n".join(f"  ({c['id']}, 'CPF', {q(c['doc'])}, {q(c['nome'])}, {q(c['fone'])}, now())" for c in clientes) + ";")
w("")
w("INSERT INTO contrato (id, numero_contrato, sistema_origem, cliente_id, vendedor_id, equipe_id, backoffice_id,"
  " data_venda, origem, canal, tipo_contrato, forma_pagamento, dia_vencimento, status_venda, status_contrato,"
  " motivo_id, cidade_id, bairro, endereco, tipo_imovel, data_agendamento, turno, pacote_valor, auditoria) OVERRIDING SYSTEM VALUE VALUES")
rows = []
for c in contratos:
    rows.append(f"  ({c['id']}, {q(c['numero'])}, 'NORTE', {c['cliente']}, {c['vend']}, {c['equipe']}, {c['bko'] or 'NULL'},"
                f" {dt(c['data'])}, {q(c['origem'])}, {q(c['canal'])}, {q(c['tipo'])}, {q(c['forma'])}, {c['dia_venc']},"
                f" {q(c['st'])}, {q(c['stc'])}, {c['motivo'] or 'NULL'}, {c['cidade']}, {q(c['bairro'])}, {q(c['endereco'])},"
                f" {q(c['tipo_imovel'])}, {dt(c['data'] + timedelta(days=3))}, {q(c['turno'])}, {c['pacote']}, 'NAO_AUDITADA')")
w(",\n".join(rows) + ";")
w("")
w("INSERT INTO contrato_item (id, contrato_id, produto_id, quantidade, tipo_adesao, codigo_chip, chip_ativo) OVERRIDING SYSTEM VALUE VALUES")
w(",\n".join(f"  ({i['id']}, {i['contrato']}, {i['produto']}, {i['qtd']}, {q(i['adesao'])}, {q(i['chip'])}, "
             f"{'NULL' if i['chip_ativo'] is None else ('true' if i['chip_ativo'] else 'false')})" for i in itens) + ";")
w("")
w("-- faturas (base do FPD: fatura nº 1)")
w("INSERT INTO fatura (id, contrato_id, numero, vencimento, prazo_limite, valor, data_pagamento, situacao) OVERRIDING SYSTEM VALUE VALUES")
w(",\n".join(f"  ({f['id']}, {f['contrato']}, 1, {dt(f['venc'])}, {dt(f['limite'])}, {f['valor']}, {dt(f['pag'])}, {q(f['situacao'])})"
             for f in faturas) + ";")
w("")
w("-- rota de instalação")
w("INSERT INTO agenda_instalacao (id, contrato_id, data_rota, turno, situacao, confirmada, bko_confirmacao_id, nota_satisfacao, atualizada_em) OVERRIDING SYSTEM VALUE VALUES")
w(",\n".join(f"  ({a['id']}, {a['contrato']}, {dt(a['data_rota'])}, {q(a['turno'])}, {q(a['situacao'])}, "
             f"{'true' if a['confirmada'] else 'false'}, {a['bko']}, {a['nota'] or 'NULL'}, now())" for a in agenda) + ";")
w("")
w("INSERT INTO confirmacao_venda (id, contrato_id, etapa, resultado, observacao, feito_por, feito_em) OVERRIDING SYSTEM VALUE VALUES")
w(",\n".join(f"  ({c['id']}, {c['contrato']}, {q(c['etapa'])}, {q(c['resultado'])}, {q(c['obs'])}, {c['por']}, {dt(c['em'])})"
             for c in confirmacoes) + ";")
w("")
w("-- pendências, chips e cadastros em andamento")
w("INSERT INTO pendencia (id, tipo, data_abertura, vendedor_id, backoffice_id, cliente_nome, descricao, aberta, motivo_id, resolvida_em) OVERRIDING SYSTEM VALUE VALUES")
w(",\n".join(f"  ({p['id']}, {q(p['tipo'])}, {dt(p['data'])}, {p['vend']}, {p['bko']}, {q(p['cliente'])}, {q(p['desc'])}, "
             f"{'true' if p['aberta'] else 'false'}, {p['motivo']}, {'NULL' if p['aberta'] else dt(p['data'] + timedelta(days=4))})" for p in pendencias) + ";")
w("")
w("-- viabilidades")
w("INSERT INTO viabilidade (id, vendedor_id, cep, logradouro, numero, bairro, cidade, uf, cliente_nome, status,"
  " respondido_por, respondido_em, criado_em, atualizado_em, encaminhado_para, encaminhado_em,"
  " checa_credito, checa_linha, checa_endereco, credito_oferta_single, credito_status, linha_status) OVERRIDING SYSTEM VALUE VALUES")
w(",\n".join(f"  ({v['id']}, {v['vend']}, {q(v['cep'])}, {q(v['logr'])}, {q(v['num'])}, {q(v['bairro'])}, {q(v['cidade'])},"
             f" {q(v['uf'])}, {q(v['cliente'])}, {q(v['status'])}, {v['bko'] if v['resp'] else 'NULL'}, {dt(v['resp'])},"
             f" {dt(v['criado'])}, {dt(v['criado'])}, {q(v['enc'])}, {dt(v['resp'])},"
             f" false, false, false, false, 'PENDENTE', 'PENDENTE')" for v in viabs) + ";")
w("")
w("-- ajusta as sequências para os próximos cadastros não colidirem")
for tabela, col in [('usuario', 'id'), ('equipe', 'id'), ('cliente', 'id'), ('contrato', 'id'),
                    ('contrato_item', 'id'), ('fatura', 'id'), ('agenda_instalacao', 'id'),
                    ('confirmacao_venda', 'id'), ('pendencia', 'id'), ('viabilidade', 'id')]:
    w(f"SELECT setval(pg_get_serial_sequence('seven.{tabela}', '{col}'), (SELECT max({col}) FROM seven.{tabela}));")
w("")
w("-- CRM de demonstração (clientes e retornos do vendedor)")
w("INSERT INTO crm_cliente (vendedor_id, nome, telefone, status)")
w(f"SELECT id, 'Cliente demonstração ' || n, '(99) 90000-000' || n, 'ATIVO'")
w(f"FROM usuario, generate_series(1,3) n WHERE id = {vendedores[0]['id']};")

print("\n".join(out))
