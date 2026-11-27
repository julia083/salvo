extends CharacterBody3D

@export var velocidade: float = 5.0
@export var gravidade: float = 9.8
@export var distancia_pegar: float = 1.4
@export var altura_bandeira_carregada: float = 0.7
@export var nomes_bandeiras: Array[String] = ["flag1", "flag2", "flag3"]
@export var buscar_bandeiras_z_positivo: bool = true
@export var entregar_em_z_positivo: bool = false

enum Estado { BUSCANDO, RETORNANDO }

var estado: Estado = Estado.BUSCANDO
var bandeira_alvo: Node3D = null
var bandeira_carregada: Node3D = null
var offset_visual_bandeira: Vector3 = Vector3.ZERO

func _ready() -> void:
	var bandeiras := get_tree().root.find_child("bandeira", true, false)
	if not bandeiras:
		return
	for bandeira in bandeiras.get_children():
		if bandeira.name in nomes_bandeiras and bandeira is RigidBody3D:
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
		return

	var z_anterior := global_position.z
	if estado == Estado.BUSCANDO:
		_processar_busca()
	else:
		_processar_retorno()
	move_and_slide()

	if estado == Estado.BUSCANDO:
		_verificar_colisao_bandeira()
	elif is_instance_valid(bandeira_carregada):
		_atualizar_posicao_bandeira()
		# A linha central conta como lado de retorno: z <= 0 conclui a entrega.
		var cruzou_linha: bool
		if entregar_em_z_positivo:
			cruzou_linha = z_anterior < 0.0 and global_position.z >= 0.0
		else:
			cruzou_linha = z_anterior > 0.0 and global_position.z <= 0.0
		if cruzou_linha:
			bandeira_carregada.queue_free()
			bandeira_carregada = null
			estado = Estado.BUSCANDO
			bandeira_alvo = null

func _processar_busca() -> void:
	if not _bandeira_disponivel(bandeira_alvo):
		_liberar_reserva(bandeira_alvo)
		bandeira_alvo = _encontrar_bandeira()
	if not is_instance_valid(bandeira_alvo):
		_parar_movimento()
		return

	var destino := _obter_posicao_bandeira(bandeira_alvo)
	var distancia := Vector2(destino.x - global_position.x, destino.z - global_position.z).length()
	if distancia <= distancia_pegar:
		_pegar_bandeira(bandeira_alvo)
	else:
		_mover_para(destino)

func _processar_retorno() -> void:
	if not is_instance_valid(bandeira_carregada):
		bandeira_carregada = null
		estado = Estado.BUSCANDO
		return
	_mover_para(Vector3(global_position.x, global_position.y, -0.35))
	_atualizar_posicao_bandeira()

func _mover_para(destino: Vector3) -> void:
	var direcao := destino - global_position
	direcao.y = 0.0
	if direcao.length() <= 0.1:
		_parar_movimento()
		return
	direcao = direcao.normalized()
	velocity.x = direcao.x * velocidade
	velocity.z = direcao.z * velocidade
	look_at(global_position + direcao, Vector3.UP)

func _parar_movimento() -> void:
	velocity.x = move_toward(velocity.x, 0.0, velocidade)
	velocity.z = move_toward(velocity.z, 0.0, velocidade)

func _encontrar_bandeira() -> Node3D:
	var no_bandeiras := get_tree().root.find_child("bandeira", true, false)
	if not no_bandeiras:
		return null
	var mais_proxima: Node3D = null
	var menor_distancia := INF
	for bandeira in no_bandeiras.get_children():
		if not (bandeira is Node3D) or not _bandeira_disponivel(bandeira):
			continue
		var reservada_por = bandeira.get_meta("reservada_por") if bandeira.has_meta("reservada_por") else null
		if is_instance_valid(reservada_por) and reservada_por != self:
			continue
		var distancia := global_position.distance_squared_to(_obter_posicao_bandeira(bandeira))
		if distancia < menor_distancia:
			menor_distancia = distancia
			mais_proxima = bandeira
	if mais_proxima:
		mais_proxima.set_meta("reservada_por", self)
	return mais_proxima

func _bandeira_disponivel(bandeira: Node3D) -> bool:
	if not is_instance_valid(bandeira) or bandeira.name not in nomes_bandeiras:
		return false
	if bandeira.has_meta("capturada") and bandeira.get_meta("capturada"):
		return false
	var carregador = bandeira.get_meta("carregada_por") if bandeira.has_meta("carregada_por") else null
	if is_instance_valid(carregador) and carregador != self:
		return false
	var z_bandeira := _obter_posicao_bandeira(bandeira).z
	return z_bandeira > 0.0 if buscar_bandeiras_z_positivo else z_bandeira <= 0.0

func _verificar_colisao_bandeira() -> void:
	for indice in range(get_slide_collision_count()):
		var colisor := get_slide_collision(indice).get_collider() as Node3D
		if colisor and _bandeira_disponivel(colisor):
			_pegar_bandeira(colisor)
			return
	if is_instance_valid(bandeira_alvo):
		var posicao := _obter_posicao_bandeira(bandeira_alvo)
		var distancia := Vector2(global_position.x - posicao.x, global_position.z - posicao.z).length()
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
	offset_visual_bandeira = bandeira.global_position - _obter_posicao_bandeira(bandeira)
	if bandeira is RigidBody3D:
		var corpo := bandeira as RigidBody3D
		corpo.freeze = true
		corpo.linear_velocity = Vector3.ZERO
		corpo.angular_velocity = Vector3.ZERO
		corpo.collision_layer = 0
		corpo.collision_mask = 0
	estado = Estado.RETORNANDO
	_atualizar_posicao_bandeira()

func _atualizar_posicao_bandeira() -> void:
	if is_instance_valid(bandeira_carregada):
		bandeira_carregada.global_position = global_position + Vector3(0.0, altura_bandeira_carregada, 0.0) + offset_visual_bandeira

func _liberar_reserva(bandeira: Node3D) -> void:
	if is_instance_valid(bandeira) and bandeira.has_meta("reservada_por") and bandeira.get_meta("reservada_por") == self:
		bandeira.remove_meta("reservada_por")
