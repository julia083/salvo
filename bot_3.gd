extends CharacterBody3D

@export var velocidade: float = 3.5
@export var gravidade: float = 9.8
@export var limite_x: float = 10.8
@export var limite_z: float = 23.8

var posicao_inicial: Vector3 = Vector3.ZERO
var alvo_atual: Node3D = null

func _ready() -> void:
	posicao_inicial = global_position

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
	if is_instance_valid(aliado_congelado):
		_mover_para(aliado_congelado.global_position)
		move_and_slide()
		return

	# Só avança para congelar invasores quando a recarga estiver pronta; caso contrário, protege a base.
	var recarga := float(get_meta("tempo_recarga_congelar")) if has_meta("tempo_recarga_congelar") else 0.0
	if recarga <= 0.0:
		alvo_atual = _encontrar_invasor_mais_proximo()
		if is_instance_valid(alvo_atual):
			_mover_para(alvo_atual.global_position)
		else:
			_mover_para_guarda()
	else:
		_mover_para_guarda()

	move_and_slide()

func _mover_para_guarda() -> void:
	var dist := Vector2(posicao_inicial.x - global_position.x, posicao_inicial.z - global_position.z).length()
	if dist > 0.8:
		_mover_para(posicao_inicial)
	else:
		_parar_movimento_horizontal()

func _mover_para(destino: Vector3) -> void:
	var direcao := destino - global_position
	direcao.y = 0.0
	if direcao.length() <= 0.15:
		_parar_movimento_horizontal()
		return

	direcao = direcao.normalized()
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

func _parar_movimento_horizontal() -> void:
	velocity.x = move_toward(velocity.x, 0.0, velocidade)
	velocity.z = move_toward(velocity.z, 0.0, velocidade)

func _encontrar_aliado_congelado() -> Node3D:
	var mais_proximo: Node3D = null
	var menor_distancia := INF
	for aliado in get_tree().get_nodes_in_group("time_b"):
		if not (aliado is Node3D) or aliado == self:
			continue
		if not (aliado.has_meta("congelado") and aliado.get_meta("congelado")):
			continue
		var distancia := global_position.distance_to(aliado.global_position)
		if distancia < menor_distancia:
			menor_distancia = distancia
			mais_proximo = aliado
	return mais_proximo

func _encontrar_invasor_mais_proximo() -> Node3D:
	var mais_proximo: Node3D = null
	var menor_distancia := INF
	for jogador in get_tree().get_nodes_in_group("time_a"):
		if not (jogador is Node3D):
			continue
		var congelado_atual := jogador.has_meta("congelado") and bool(jogador.get_meta("congelado"))
		var imune_atual := jogador.has_meta("imune_congelamento") and bool(jogador.get_meta("imune_congelamento"))
		if congelado_atual or imune_atual:
			continue
		# Defende o campo do time B (z <= 2.0) em vez de perseguir o time A até o outro lado.
		if jogador.global_position.z > 2.0:
			continue
		var distancia := global_position.distance_to(jogador.global_position)
		if distancia < menor_distancia:
			menor_distancia = distancia
			mais_proximo = jogador
	return mais_proximo
