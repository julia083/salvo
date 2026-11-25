export const JOGADOR_AUX_GD = `extends CharacterBody3D

enum Estado {
\tINDO_PARA_BANDEIRA,
\tRETORNANDO_COM_BANDEIRA,
\tCONCLUIDO
}

@export var velocidade: float = 4.2
@export var gravidade: float = 9.8
@export var distancia_pegar: float = 1.6
@export var distancia_entrega: float = 1.8
@export var distancia_evasao: float = 4.0
@export var forca_evasao: float = 1.35
@export var limite_x: float = 10.8
@export var limite_z: float = 23.8

var estado: Estado = Estado.INDO_PARA_BANDEIRA
var posicao_inicial: Vector3 = Vector3.ZERO
var bandeira_alvo: Node3D = null
var bandeira_carregada: Node3D = null
var offset_visual_bandeira: Vector3 = Vector3.ZERO

func _ready() -> void:
\tposicao_inicial = global_position

func _physics_process(delta: float) -> void:
\t# Aplica a gravidade se não estiver no chão
\tif not is_on_floor():
\t\tvelocity.y -= gravidade * delta
\telse:
\t\tvelocity.y = 0.0

\tmatch estado:
\t\tEstado.INDO_PARA_BANDEIRA:
\t\t\t_processar_ida_bandeira()
\t\tEstado.RETORNANDO_COM_BANDEIRA:
\t\t\t_processar_retorno_com_bandeira()
\t\tEstado.CONCLUIDO:
\t\t\t_processar_concluido()

\tmove_and_slide()

\tif estado == Estado.RETORNANDO_COM_BANDEIRA:
\t\tatualizar_posicao_bandeira_carregada()

func _processar_ida_bandeira() -> void:
\tif not _bandeira_disponivel(bandeira_alvo):
\t\t_liberar_reserva(bandeira_alvo)
\t\tbandeira_alvo = encontrar_bandeira_inimiga()

\tif not bandeira_alvo:
\t\tif not _existem_bandeiras_inimigas_restantes():
\t\t\testado = Estado.CONCLUIDO
\t\telse:
\t\t\t_parar_movimento_horizontal()
\t\treturn

\tvar pos_alvo := obter_posicao_bandeira(bandeira_alvo)
\tvar dist_xz := Vector2(pos_alvo.x - global_position.x, pos_alvo.z - global_position.z).length()

\tif dist_xz <= distancia_pegar:
\t\tpegar_bandeira(bandeira_alvo)
\telse:
\t\tmover_para(pos_alvo, true)

func _processar_retorno_com_bandeira() -> void:
\tif not is_instance_valid(bandeira_carregada):
\t\tbandeira_carregada = null
\t\testado = Estado.INDO_PARA_BANDEIRA
\t\treturn

\tatualizar_posicao_bandeira_carregada()

\tvar destino := Vector3(posicao_inicial.x, global_position.y, posicao_inicial.z)
\tvar dist_base := Vector2(destino.x - global_position.x, destino.z - global_position.z).length()

\tif dist_base <= distancia_entrega or global_position.z >= posicao_inicial.z:
\t\tentregar_bandeira()
\telse:
\t\tmover_para(destino, true)

func _processar_concluido() -> void:
\tvar dist_inicial := Vector2(posicao_inicial.x - global_position.x, posicao_inicial.z - global_position.z).length()
\tif dist_inicial > 0.5:
\t\tmover_para(posicao_inicial, false)
\telse:
\t\t_parar_movimento_horizontal()

func mover_para(destino: Vector3, evitar_bots: bool) -> void:
\tvar direcao := destino - global_position
\tdirecao.y = 0.0

\tif direcao.length() <= 0.1:
\t\t_parar_movimento_horizontal()
\t\treturn

\tdirecao = direcao.normalized()

\tif evitar_bots:
\t\tvar evasao := _calcular_vetor_evasao_bots()
\t\tif evasao.length_squared() > 0.001:
\t\t\tdirecao = (direcao + evasao).normalized()

\t# Mantém o movimento dentro dos limites do campo para não travar nas paredes
\tif global_position.x >= limite_x and direcao.x > 0.0:
\t\tdirecao.x = 0.0
\telif global_position.x <= -limite_x and direcao.x < 0.0:
\t\tdirecao.x = 0.0

\tif global_position.z >= limite_z and direcao.z > 0.0:
\t\tdirecao.z = 0.0
\telif global_position.z <= -limite_z and direcao.z < 0.0:
\t\tdirecao.z = 0.0

\tif direcao.length_squared() > 0.001:
\t\tdirecao = direcao.normalized()
\t\tvelocity.x = direcao.x * velocidade
\t\tvelocity.z = direcao.z * velocidade
\t\tvar alvo_olhar := Vector3(global_position.x + direcao.x, global_position.y, global_position.z + direcao.z)
\t\tlook_at(alvo_olhar, Vector3.UP)
\telse:
\t\t_parar_movimento_horizontal()

func _parar_movimento_horizontal() -> void:
\tvelocity.x = move_toward(velocity.x, 0.0, velocidade)
\tvelocity.z = move_toward(velocity.z, 0.0, velocidade)

func _calcular_vetor_evasao_bots() -> Vector3:
\tvar no_bots := get_tree().root.find_child("bots", true, false)
\tif not no_bots:
\t\treturn Vector3.ZERO

\tvar vetor_evasao := Vector3.ZERO
\tfor bot in no_bots.get_children():
\t\tif bot is Node3D:
\t\t\tvar diferenca := global_position - bot.global_position
\t\t\tdiferenca.y = 0.0
\t\t\tvar dist := diferenca.length()
\t\t\tif dist > 0.01 and dist < distancia_evasao:
\t\t\t\tvar peso := (distancia_evasao - dist) / distancia_evasao
\t\t\t\tvetor_evasao += diferenca.normalized() * peso * forca_evasao

\treturn vetor_evasao

func encontrar_bandeira_inimiga() -> Node3D:
\tvar no_bandeira := get_tree().root.find_child("bandeira", true, false)
\tif not no_bandeira:
\t\treturn null

\tvar mais_proxima: Node3D = null
\tvar menor_distancia: float = INF

\tfor bandeira in no_bandeira.get_children():
\t\tif not _bandeira_disponivel(bandeira):
\t\t\tcontinue

\t\tvar reservada_por = bandeira.get_meta("reservada_por", null)
\t\tif is_instance_valid(reservada_por) and reservada_por != self:
\t\t\tcontinue

\t\tvar pos := obter_posicao_bandeira(bandeira)
\t\tvar distancia := global_position.distance_to(pos)
\t\tif distancia < menor_distancia:
\t\t\tmenor_distancia = distancia
\t\t\tmais_proxima = bandeira

\tif mais_proxima:
\t\tmais_proxima.set_meta("reservada_por", self)

\treturn mais_proxima

func _bandeira_disponivel(bandeira: Node3D) -> bool:
\tif not is_instance_valid(bandeira):
\t\treturn false
\tif bandeira.has_meta("capturada") and bandeira.get_meta("capturada"):
\t\treturn false
\tif bandeira.has_meta("carregada_por"):
\t\tvar carregador = bandeira.get_meta("carregada_por")
\t\tif is_instance_valid(carregador) and carregador != self:
\t\t\treturn false
\tvar pos := obter_posicao_bandeira(bandeira)
\t# Bandeiras inimigas ficam na metade dos bots (z < 0)
\treturn pos.z < 0.0

func _existem_bandeiras_inimigas_restantes() -> bool:
\tvar no_bandeira := get_tree().root.find_child("bandeira", true, false)
\tif not no_bandeira:
\t\treturn false
\tfor bandeira in no_bandeira.get_children():
\t\tif bandeira is Node3D and _bandeira_disponivel(bandeira):
\t\t\treturn true
\treturn false

func _liberar_reserva(bandeira: Node3D) -> void:
\tif is_instance_valid(bandeira) and bandeira.has_meta("reservada_por"):
\t\tif bandeira.get_meta("reservada_por") == self:
\t\t\tbandeira.remove_meta("reservada_por")

func obter_posicao_bandeira(bandeira: Node3D) -> Vector3:
\tvar colisor := bandeira.find_child("CollisionShape3D", false, false)
\tif colisor is Node3D:
\t\treturn colisor.global_position
\treturn bandeira.global_position

func pegar_bandeira(bandeira: Node3D) -> void:
\tbandeira_carregada = bandeira
\tbandeira_alvo = null
\tbandeira.set_meta("carregada_por", self)
\tif bandeira.has_meta("reservada_por"):
\t\tbandeira.remove_meta("reservada_por")

\tvar pos_real := obter_posicao_bandeira(bandeira)
\toffset_visual_bandeira = bandeira.global_position - pos_real
\testado = Estado.RETORNANDO_COM_BANDEIRA

func atualizar_posicao_bandeira_carregada() -> void:
\tif is_instance_valid(bandeira_carregada):
\t\tbandeira_carregada.global_position = Vector3(
\t\t\tglobal_position.x,
\t\t\tglobal_position.y + 0.5,
\t\t\tglobal_position.z
\t\t) + offset_visual_bandeira

func entregar_bandeira() -> void:
\tif is_instance_valid(bandeira_carregada):
\t\tbandeira_carregada.set_meta("capturada", true)
\t\tif bandeira_carregada.has_meta("carregada_por"):
\t\t\tbandeira_carregada.remove_meta("carregada_por")
\t\tbandeira_carregada.global_position = Vector3(
\t\t\tglobal_position.x,
\t\t\tposicao_inicial.y + 0.45,
\t\t\tposicao_inicial.z
\t\t) + offset_visual_bandeira

\tbandeira_carregada = null
\tbandeira_alvo = encontrar_bandeira_inimiga()
\tif bandeira_alvo:
\t\testado = Estado.INDO_PARA_BANDEIRA
\telse:
\t\testado = Estado.CONCLUIDO`;

export const MAIN_TSCN_DIFF = `--- a/main.tscn
+++ b/main.tscn
@@ -6,6 +6,7 @@
 [ext_resource type="Script" uid="uid://wbk2px0jdhyr" path="res://bot_3.gd" id="4_lquwl"]
 [ext_resource type="Script" uid="uid://bt2mitojrhaol" path="res://animaçaoperson.gd" id="5_272bh"]
 [ext_resource type="PackedScene" uid="uid://ui3un44k443a" path="res://addons/flag/scene.gltf" id="5_lquwl"]
+[ext_resource type="Script" path="res://jogador_aux.gd" id="6_aux01"]
 
 [node name="jogador_aux_1" type="CharacterBody3D" parent="jogadores" unique_id=2012810355]
 transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 8.841366, 1.5117397, 17.1435)
+script = ExtResource("6_aux01")
 
 [node name="jogador_aux_2" type="CharacterBody3D" parent="jogadores" unique_id=758653922]
 transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, -6.8239, 1.8798547, 17.113796)
+script = ExtResource("6_aux01")`;
