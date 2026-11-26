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

	alvo_atual = _encontrar_bot_mais_proximo()
	if is_instance_valid(alvo_atual):
		var direcao: Vector3 = alvo_atual.global_position - global_position
		direcao.y = 0.0
		if direcao.length() > distancia_parar:
			direcao = direcao.normalized()
			# Mantém o auxiliar dentro do campo enquanto acompanha o bot.
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

func _encontrar_bot_mais_proximo() -> Node3D:
	var no_bots := get_tree().root.find_child("bots", true, false)
	if not no_bots:
		return null

	var mais_proximo: Node3D = null
	var menor_distancia := INF
	for nome in ["bot1", "bot2", "bot3"]:
		var bot := no_bots.get_node_or_null(NodePath(nome)) as Node3D
		if not is_instance_valid(bot):
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
