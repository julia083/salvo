extends CharacterBody3D

@export var velocidade: float = 4.2
@export var gravidade: float = 9.8
@export var distancia_parar: float = 0.9
@export var limite_x: float = 10.8
@export var limite_z: float = 23.8

var alvo_atual: Node3D = null

func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= gravidade * delta
	else:
		velocity.y = 0.0

	if has_meta("congelado") and get_meta("congelado"):
		velocity.x = 0.0
		velocity.z = 0.0
		move_and_slide()
		return

	var aliado_congelado := _encontrar_aliado_congelado()
	var recarga := float(get_meta("tempo_recarga_congelar")) if has_meta("tempo_recarga_congelar") else 0.0
	if is_instance_valid(aliado_congelado):
		alvo_atual = aliado_congelado
	elif recarga <= 0.0:
		alvo_atual = _encontrar_bot_mais_proximo()
	else:
		alvo_atual = null
	if is_instance_valid(alvo_atual):
		var direcao: Vector3 = alvo_atual.global_position - global_position
		direcao.y = 0.0
		if direcao.length() > distancia_parar:
			direcao = direcao.normalized()
			# Mantém o auxiliar dentro do campo enquanto acompanha o alvo.
			if global_position.x >= limite_x and direcao.x > 0.0:
				direcao.x = 0.0
			elif global_position.x <= -limite_x and direcao.x < 0.0:
				direcao.x = 0.0
			if global_position.z >= limite_z and direcao.z > 0.0:
				direcao.z = 0.0
			elif global_position.z <= -limite_z and direcao.z < 0.0:
				direcao.z = 0.0

			if direcao.length_squared() > 0.001:
				direcao = direcao.normalized()
				velocity.x = direcao.x * velocidade
				velocity.z = direcao.z * velocidade
				look_at(global_position + Vector3(direcao.x, 0.0, direcao.z), Vector3.UP)
			else:
				_parar_movimento_horizontal()
		else:
			_parar_movimento_horizontal()
	else:
		_parar_movimento_horizontal()

	move_and_slide()

func _encontrar_aliado_congelado() -> Node3D:
	var mais_proximo: Node3D = null
	var menor_distancia := INF
	for aliado in get_tree().get_nodes_in_group("time_a"):
		if not (aliado is Node3D) or aliado == self:
			continue
		if not (aliado.has_meta("congelado") and aliado.get_meta("congelado")):
			continue
		var diferenca: Vector3 = aliado.global_position - global_position
		diferenca.y = 0.0
		var distancia := diferenca.length()
		if distancia < menor_distancia:
			menor_distancia = distancia
			mais_proximo = aliado
	return mais_proximo

func _encontrar_bot_mais_proximo() -> Node3D:
	var no_bots := get_tree().root.find_child("bots", true, false)
	if not no_bots:
		return null

	var mais_proximo: Node3D = null
	var menor_distancia := INF
	for nome in ["bot1", "bot2", "bot3"]:
		var bot := no_bots.get_node_or_null(NodePath(nome)) as Node3D
		if not is_instance_valid(bot) or (bot.has_meta("congelado") and bot.get_meta("congelado")):
			continue
		var diferenca: Vector3 = bot.global_position - global_position
		diferenca.y = 0.0
		var distancia := diferenca.length()
		if distancia < menor_distancia:
			menor_distancia = distancia
			mais_proximo = bot
	return mais_proximo

func _parar_movimento_horizontal() -> void:
	velocity.x = move_toward(velocity.x, 0.0, velocidade)
	velocity.z = move_toward(velocity.z, 0.0, velocidade)
