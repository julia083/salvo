extends CharacterBody3D

enum Estado {
	BUSCANDO_BANDEIRA,
	RETORNANDO_COM_BANDEIRA
}

@export var velocidade: float = 3.8
@export var gravidade: float = 9.8
@export var distancia_pegar: float = 1.6
@export var distancia_evasao: float = 4.0
@export var forca_evasao: float = 1.35
@export var limite_x: float = 10.8
@export var limite_z: float = 23.8
@export var nome_animacao_andar: String = ""

@onready var anim_player: AnimationPlayer = get_node_or_null("AnimationPlayer") as AnimationPlayer

var estado: Estado = Estado.BUSCANDO_BANDEIRA
var bandeira_alvo: Node3D = null
var bandeira_carregada: Node3D = null
var offset_visual_bandeira: Vector3 = Vector3.ZERO

func _ready() -> void:
	var no_bandeiras := get_tree().root.find_child("bandeira", true, false)
	if not no_bandeiras:
		return
	for bandeira in no_bandeiras.get_children():
		if bandeira.name in ["flag1", "flag2", "flag3"] and bandeira is RigidBody3D:
			bandeira.freeze = true
			bandeira.lock_rotation = true

func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= gravidade * delta
	else:
		velocity.y = 0.0

	if has_meta("congelado") and get_meta("congelado"):
		velocity.x = 0.0
		velocity.z = 0.0
		move_and_slide()
		if anim_player and anim_player.is_playing():
			anim_player.pause()
		return

	if estado == Estado.BUSCANDO_BANDEIRA:
		_processar_busca()
	else:
		_processar_retorno()

	var z_anterior := global_position.z
	move_and_slide()
	atualizar_animacao()

	if estado == Estado.BUSCANDO_BANDEIRA:
		_verificar_colisao_bandeira()
	elif is_instance_valid(bandeira_carregada):
		if z_anterior > 0.0 and global_position.z <= 0.0:
			bandeira_carregada.queue_free()
			bandeira_carregada = null
			estado = Estado.BUSCANDO_BANDEIRA
			bandeira_alvo = null
		else:
			_atualizar_posicao_bandeira()

func _processar_busca() -> void:
	if not _bandeira_disponivel(bandeira_alvo):
		_liberar_reserva(bandeira_alvo)
		bandeira_alvo = _encontrar_bandeira_adversaria()

	if not is_instance_valid(bandeira_alvo):
		_parar_movimento_horizontal()
		return

	var pos_alvo := _obter_posicao_bandeira(bandeira_alvo)
	var distancia_xz := Vector2(pos_alvo.x - global_position.x, pos_alvo.z - global_position.z).length()
	if distancia_xz <= distancia_pegar:
		_pegar_bandeira(bandeira_alvo)
	else:
		_mover_para(pos_alvo, true)

func _processar_retorno() -> void:
	if not is_instance_valid(bandeira_carregada):
		bandeira_carregada = null
		estado = Estado.BUSCANDO_BANDEIRA
		return

	_mover_para(Vector3(global_position.x, global_position.y, -0.35), true)
	_atualizar_posicao_bandeira()

func _mover_para(destino: Vector3, evitar_adversarios: bool) -> void:
	var direcao := destino - global_position
	direcao.y = 0.0
	if direcao.length() <= 0.1:
		_parar_movimento_horizontal()
		return

	direcao = direcao.normalized()
	if evitar_adversarios:
		var evasao := _calcular_vetor_evasao_jogadores()
		if evasao.length_squared() > 0.001:
			direcao = (direcao + evasao).normalized()

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

func _calcular_vetor_evasao_jogadores() -> Vector3:
	var evasao := Vector3.ZERO
	for jogador in get_tree().get_nodes_in_group("time_a"):
		if jogador is Node3D and not (jogador.has_meta("congelado") and jogador.get_meta("congelado")):
			var diferenca: Vector3 = global_position - jogador.global_position
			diferenca.y = 0.0
			var distancia := diferenca.length()
			if distancia > 0.01 and distancia < distancia_evasao:
				evasao += diferenca.normalized() * ((distancia_evasao - distancia) / distancia_evasao) * forca_evasao
	return evasao

func _encontrar_bandeira_adversaria() -> Node3D:
	var no_bandeiras := get_tree().root.find_child("bandeira", true, false)
	if not no_bandeiras:
		return null

	var mais_proxima: Node3D = null
	var menor_distancia := INF
	for bandeira in no_bandeiras.get_children():
		if not (bandeira is Node3D) or not _bandeira_disponivel(bandeira):
			continue
		var reservada_por = bandeira.get_meta("reservada_por") if bandeira.has_meta("reservada_por") else null
		if is_instance_valid(reservada_por) and reservada_por != self and not (reservada_por.has_meta("congelado") and reservada_por.get_meta("congelado")):
			continue
		var distancia := global_position.distance_to(_obter_posicao_bandeira(bandeira))
		if distancia < menor_distancia:
			menor_distancia = distancia
			mais_proxima = bandeira

	if mais_proxima:
		mais_proxima.set_meta("reservada_por", self)
	return mais_proxima

func _bandeira_disponivel(bandeira: Node3D) -> bool:
	if not is_instance_valid(bandeira) or bandeira.name not in ["flag1", "flag2", "flag3"]:
		return false
	if bandeira.has_meta("capturada") and bandeira.get_meta("capturada"):
		return false
	var carregador = bandeira.get_meta("carregada_por") if bandeira.has_meta("carregada_por") else null
	if is_instance_valid(carregador) and carregador != self:
		return false
	return _obter_posicao_bandeira(bandeira).z > 0.0

func _verificar_colisao_bandeira() -> void:
	for indice in range(get_slide_collision_count()):
		var colisor := get_slide_collision(indice).get_collider() as Node3D
		if colisor and colisor.name in ["flag1", "flag2", "flag3"] and _bandeira_disponivel(colisor):
			_pegar_bandeira(colisor)
			return

	if is_instance_valid(bandeira_alvo):
		var pos := _obter_posicao_bandeira(bandeira_alvo)
		var distancia := Vector2(global_position.x - pos.x, global_position.z - pos.z).length()
		if distancia <= distancia_pegar and _bandeira_disponivel(bandeira_alvo):
			_pegar_bandeira(bandeira_alvo)

func _obter_posicao_bandeira(bandeira: Node3D) -> Vector3:
	var colisor := bandeira.find_child("CollisionShape3D", false, false) as Node3D
	return colisor.global_position if colisor else bandeira.global_position

func _pegar_bandeira(bandeira: Node3D) -> void:
	bandeira_alvo = null
	bandeira_carregada = bandeira
	bandeira.set_meta("carregada_por", self)
	if bandeira.has_meta("reservada_por"):
		bandeira.remove_meta("reservada_por")

	var posicao_colisor := _obter_posicao_bandeira(bandeira)
	offset_visual_bandeira = bandeira.global_position - posicao_colisor
	if bandeira is RigidBody3D:
		var corpo := bandeira as RigidBody3D
		corpo.freeze = true
		corpo.linear_velocity = Vector3.ZERO
		corpo.angular_velocity = Vector3.ZERO
		corpo.collision_layer = 0
		corpo.collision_mask = 0

	estado = Estado.RETORNANDO_COM_BANDEIRA
	_atualizar_posicao_bandeira()

func _atualizar_posicao_bandeira() -> void:
	if is_instance_valid(bandeira_carregada):
		bandeira_carregada.global_position = global_position + Vector3(0.0, 0.5, 0.0) + offset_visual_bandeira

func _liberar_reserva(bandeira: Node3D) -> void:
	if is_instance_valid(bandeira) and bandeira.has_meta("reservada_por") and bandeira.get_meta("reservada_por") == self:
		bandeira.remove_meta("reservada_por")

func atualizar_animacao() -> void:
	if not anim_player or nome_animacao_andar == "":
		return

	var velocidade_horizontal := Vector2(velocity.x, velocity.z).length()
	if velocidade_horizontal > 0.1:
		if anim_player.current_animation != nome_animacao_andar:
			anim_player.play(nome_animacao_andar)
	else:
		if anim_player.is_playing():
			anim_player.stop()
