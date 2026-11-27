extends Node3D

signal placar_atualizado(pontuacao_vermelha: int, pontuacao_azul: int)

var pontuacao_vermelha: int = 0
var pontuacao_azul: int = 0

func capturar_bandeira(bandeira: Node3D) -> void:
	if not is_instance_valid(bandeira):
		return
	if bandeira.has_meta("capturada") and bool(bandeira.get_meta("capturada")):
		return
	bandeira.set_meta("capturada", true)
	if bandeira.name in ["flag1", "flag2", "flag3"]:
		# As bandeiras em z >= 0 pertencem ao vermelho; bots azuis pontuam ao trazê-las.
		pontuacao_azul += 1
	elif bandeira.name in ["flag4", "flag5", "flag6"]:
		# As bandeiras em z <= 0 pertencem ao azul; jogadores vermelhos pontuam ao trazê-las.
		pontuacao_vermelha += 1
	placar_atualizado.emit(pontuacao_vermelha, pontuacao_azul)
	bandeira.visible = false
	if bandeira is RigidBody3D:
		var corpo := bandeira as RigidBody3D
		corpo.freeze = true
		corpo.linear_velocity = Vector3.ZERO
		corpo.angular_velocity = Vector3.ZERO
		corpo.collision_layer = 0
		corpo.collision_mask = 0
	bandeira.queue_free()
