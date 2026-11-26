extends CharacterBody3D

enum Estado {
	INDO_PARA_BANDEIRA,
	RETORNANDO_COM_BANDEIRA,
	CONCLUIDO
}

@export var velocidade: float = 4.2
@export var gravidade: float = 9.8
@export var bandeira_preferencial: String = "flag4"
@export var distancia_pegar: float = 1.6
@export var zona_entrega_z: float = 21.0
@export var distancia_evasao: float = 4.0
@export var forca_evasao: float = 1.35
@export var limite_x: float = 10.8
@export var limite_z: float = 23.8

var estado: Estado = Estado.INDO_PARA_BANDEIRA
var posicao_inicial: Vector3 = Vector3.ZERO
var bandeira_alvo: Node3D = null
var bandeira_carregada: Node3D = null
var offset_visual_bandeira: Vector3 = Vector3.ZERO
var altura_original_colisor: float = 2.0

func _ready() -> void:
	posicao_inicial = global_position

func _physics_process(delta: float) -> void:
	# Aplica a gravidade se não estiver no chão
	if not is_on_floor():
		velocity.y -= gravidade * delta
	else:
		velocity.y = 0.0

	match estado:
		Estado.INDO_PARA_BANDEIRA:
			_processar_ida_bandeira()
		Estado.RETORNANDO_COM_BANDEIRA:
			_processar_retorno_com_bandeira()
		Estado.CONCLUIDO:
			_processar_concluido()

	move_and_slide()

	if estado == Estado.RETORNANDO_COM_BANDEIRA:
		atualizar_posicao_bandeira_carregada()

func _processar_ida_bandeira() -> void:
	if not _bandeira_disponivel(bandeira_alvo):
		_liberar_reserva(bandeira_alvo)
		bandeira_alvo = encontrar_bandeira_inimiga()

	if not bandeira_alvo:
		if not _existem_bandeiras_inimigas_restantes():
			estado = Estado.CONCLUIDO
		else:
			_parar_movimento_horizontal()
		return

	var pos_alvo := obter_posicao_bandeira(bandeira_alvo)
	var dist_xz := Vector2(pos_alvo.x - global_position.x, pos_alvo.z - global_position.z).length()

	if dist_xz <= distancia_pegar:
		pegar_bandeira(bandeira_alvo)
	else:
		mover_para(pos_alvo, true)

func _processar_retorno_com_bandeira() -> void:
	if not is_instance_valid(bandeira_carregada):
		bandeira_carregada = null
		estado = Estado.INDO_PARA_BANDEIRA
		return

	atualizar_posicao_bandeira_carregada()

	var destino := Vector3(posicao_inicial.x, global_position.y, zona_entrega_z)
	if global_position.z >= zona_entrega_z:
		entregar_bandeira()
	else:
		mover_para(destino, true)

func _processar_concluido() -> void:
	var dist_inicial := Vector2(posicao_inicial.x - global_position.x, posicao_inicial.z - global_position.z).length()
	if dist_inicial > 0.6:
		mover_para(posicao_inicial, false)
	else:
		_parar_movimento_horizontal()

func mover_para(destino: Vector3, evitar_bots: bool) -> void:
	var direcao := destino - global_position
	direcao.y = 0.0

	if direcao.length() <= 0.1:
		_parar_movimento_horizontal()
		return

	direcao = direcao.normalized()

	if evitar_bots:
		var evasao := _calcular_vetor_evasao_bots()
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
		var alvo_olhar := Vector3(global_position.x + direcao.x, global_position.y, global_position.z + direcao.z)
		look_at(alvo_olhar, Vector3.UP)
	else:
		_parar_movimento_horizontal()

func _parar_movimento_horizontal() -> void:
	velocity.x = move_toward(velocity.x, 0.0, velocidade)
	velocity.z = move_toward(velocity.z, 0.0, velocidade)

func _calcular_vetor_evasao_bots() -> Vector3:
	var no_bots := get_tree().root.find_child("bots", true, false)
	if not no_bots:
		return Vector3.ZERO

	var vetor_evasao := Vector3.ZERO
	for bot in no_bots.get_children():
		if bot is Node3D:
			var diferenca := global_position - bot.global_position
			diferenca.y = 0.0
			var dist := diferenca.length()
			if dist > 0.01 and dist < distancia_evasao:
				var peso := (distancia_evasao - dist) / distancia_evasao
				vetor_evasao += diferenca.normalized() * peso * forca_evasao

	return vetor_evasao

func encontrar_bandeira_inimiga() -> Node3D:
	var no_bandeira := get_tree().root.find_child("bandeira", true, false)
	if not no_bandeira:
		return null

	# Prioriza a bandeira preferencial deste auxiliar se estiver livre
	if bandeira_preferencial != "":
		var preferida := no_bandeira.find_child(bandeira_preferencial, false, false) as Node3D
		if preferida and _bandeira_disponivel(preferida):
			var res_pref = preferida.get_meta("reservada_por", null)
			if not is_instance_valid(res_pref) or res_pref == self:
				preferida.set_meta("reservada_por", self)
				return preferida

	var mais_proxima: Node3D = null
	var menor_distancia: float = INF

	for bandeira in no_bandeira.get_children():
		if not (bandeira is Node3D) or not _bandeira_disponivel(bandeira):
			continue

		var reservada_por = bandeira.get_meta("reservada_por", null)
		if is_instance_valid(reservada_por) and reservada_por != self:
			continue

		var pos := obter_posicao_bandeira(bandeira)
		var distancia := global_position.distance_to(pos)
		if distancia < menor_distancia:
			menor_distancia = distancia
			mais_proxima = bandeira

	if mais_proxima:
		mais_proxima.set_meta("reservada_por", self)

	return mais_proxima

func _bandeira_disponivel(bandeira: Node3D) -> bool:
	if not is_instance_valid(bandeira):
		return false
	if bandeira.name not in ["flag4", "flag5", "flag6"]:
		return false
	if bandeira.has_meta("capturada") and bandeira.get_meta("capturada"):
		return false
	if bandeira.has_meta("carregada_por"):
		var carregador = bandeira.get_meta("carregada_por")
		if is_instance_valid(carregador) and carregador != self:
			return false

	var principal := get_tree().root.find_child("jogador_principal", true, false)
	if principal and principal.get("bandeira_carregada") == bandeira:
		return false

	var pos := obter_posicao_bandeira(bandeira)
	return pos.z < 0.0

func _existem_bandeiras_inimigas_restantes() -> bool:
	var no_bandeira := get_tree().root.find_child("bandeira", true, false)
	if not no_bandeira:
		return false
	for bandeira in no_bandeira.get_children():
		if bandeira is Node3D and _bandeira_disponivel(bandeira):
			return true
	return false

func _liberar_reserva(bandeira: Node3D) -> void:
	if is_instance_valid(bandeira) and bandeira.has_meta("reservada_por"):
		if bandeira.get_meta("reservada_por") == self:
			bandeira.remove_meta("reservada_por")

func obter_posicao_bandeira(bandeira: Node3D) -> Vector3:
	var colisor := bandeira.find_child("CollisionShape3D", false, false)
	if colisor is Node3D:
		return colisor.global_position
	return bandeira.global_position

func pegar_bandeira(bandeira: Node3D) -> void:
	bandeira_carregada = bandeira
	bandeira_alvo = null
	bandeira.set_meta("carregada_por", self)
	if bandeira.has_meta("reservada_por"):
		bandeira.remove_meta("reservada_por")

	var pos_real := obter_posicao_bandeira(bandeira)
	altura_original_colisor = pos_real.y
	offset_visual_bandeira = bandeira.global_position - pos_real

	if bandeira_carregada is RigidBody3D:
		var corpo := bandeira_carregada as RigidBody3D
		corpo.freeze = true
		corpo.linear_velocity = Vector3.ZERO
		corpo.angular_velocity = Vector3.ZERO
		corpo.collision_layer = 0
		corpo.collision_mask = 0

	estado = Estado.RETORNANDO_COM_BANDEIRA

func atualizar_posicao_bandeira_carregada() -> void:
	if is_instance_valid(bandeira_carregada):
		bandeira_carregada.global_position = Vector3(
			global_position.x,
			global_position.y + 0.5,
			global_position.z
		) + offset_visual_bandeira

func entregar_bandeira() -> void:
	if is_instance_valid(bandeira_carregada):
		bandeira_carregada.set_meta("capturada", true)
		if bandeira_carregada.has_meta("carregada_por"):
			bandeira_carregada.remove_meta("carregada_por")
		# Deixa a bandeira visível na área das bandeiras do time aliado
		bandeira_carregada.global_position = Vector3(
			global_position.x,
			altura_original_colisor,
			clampf(global_position.z + 1.0, zona_entrega_z, 23.5)
		) + offset_visual_bandeira

	bandeira_carregada = null
	bandeira_alvo = encontrar_bandeira_inimiga()
	if bandeira_alvo:
		estado = Estado.INDO_PARA_BANDEIRA
	else:
		estado = Estado.CONCLUIDO
