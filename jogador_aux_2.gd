extends "res://bot_busca_bandeira.gd"

@export var distancia_resgate: float = 1.4
@export var distancia_evasao_bots: float = 5.0
@export var forca_evasao_bots: float = 1.3

var principal_ja_foi_congelado: bool = false

func _ready() -> void:
	nomes_bandeiras = ["flag4", "flag5", "flag6"]
	buscar_bandeiras_z_positivo = false
	entregar_em_z_positivo = true
	super._ready()

func _physics_process(delta: float) -> void:
	if has_meta("congelado") and bool(get_meta("congelado")):
		super._physics_process(delta)
		return

	var principal := _obter_principal()
	var congelamento_principal := _componente_congelamento(principal)
	if congelamento_principal and congelamento_principal.esta_congelado:
		principal_ja_foi_congelado = true

	var aliado_congelado := _encontrar_aliado_congelado(principal, congelamento_principal)
	if is_instance_valid(aliado_congelado):
		_resgatar_aliado(aliado_congelado, delta)
		return

	if not principal_ja_foi_congelado and not is_instance_valid(bandeira_carregada):
		_defender_sem_avancar(delta)
		return

	# O caminho para as bandeiras e o retorno usam movimento evasivo.
	super._physics_process(delta)

func _obter_principal() -> Node3D:
	return get_tree().root.find_child("jogador_principal", true, false) as Node3D

func _componente_congelamento(personagem: Node3D) -> Congelamento:
	if not is_instance_valid(personagem):
		return null
	return personagem.get_node_or_null("Congelamento") as Congelamento

func _encontrar_aliado_congelado(principal: Node3D, componente_principal: Congelamento) -> Node3D:
	if is_instance_valid(principal) and componente_principal and componente_principal.esta_congelado:
		return principal
	var auxiliar_1 := get_tree().root.find_child("jogador_aux_1", true, false) as Node3D
	var componente_auxiliar := _componente_congelamento(auxiliar_1)
	if componente_auxiliar and componente_auxiliar.esta_congelado:
		return auxiliar_1
	return null

func _resgatar_aliado(aliado: Node3D, delta: float) -> void:
	if not is_on_floor():
		velocity.y -= gravidade * delta
	else:
		velocity.y = 0.0

	var diferenca := aliado.global_position - global_position
	diferenca.y = 0.0
	if diferenca.length() <= distancia_resgate:
		velocity.x = 0.0
		velocity.z = 0.0
		var componente := _componente_congelamento(aliado)
		if componente:
			componente.descongelar()
	else:
		var direcao := _direcao_com_evasao(aliado.global_position)
		if not principal_ja_foi_congelado:
			direcao = _limitar_ao_lado_positivo(direcao, delta)
		velocity.x = direcao.x * velocidade
		velocity.z = direcao.z * velocidade
		if direcao.length_squared() > 0.001:
			look_at(global_position + direcao, Vector3.UP)
	move_and_slide()
	if is_instance_valid(bandeira_carregada):
		_atualizar_posicao_bandeira()

func _defender_sem_avancar(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= gravidade * delta
	else:
		velocity.y = 0.0
	var evasao := _calcular_vetor_evasao_bots()
	if evasao.length_squared() > 0.001:
		var direcao := _limitar_ao_lado_positivo(evasao.normalized(), delta)
		velocity.x = direcao.x * velocidade
		velocity.z = direcao.z * velocidade
		if direcao.length_squared() > 0.001:
			look_at(global_position + direcao, Vector3.UP)
	else:
		_parar_movimento()
	move_and_slide()

func _mover_para(destino: Vector3) -> void:
	var direcao := _direcao_com_evasao(destino)
	if direcao.length_squared() <= 0.001:
		_parar_movimento()
		return
	velocity.x = direcao.x * velocidade
	velocity.z = direcao.z * velocidade
	look_at(global_position + direcao, Vector3.UP)

func _patrulhar_sem_bandeira() -> void:
	var evasao := _calcular_vetor_evasao_bots()
	if evasao.length_squared() > 0.001:
		var direcao := evasao.normalized()
		velocity.x = direcao.x * velocidade
		velocity.z = direcao.z * velocidade
		look_at(global_position + direcao, Vector3.UP)
	else:
		super._patrulhar_sem_bandeira()

func _direcao_com_evasao(destino: Vector3) -> Vector3:
	var direcao := destino - global_position
	direcao.y = 0.0
	if direcao.length() <= 0.1:
		return Vector3.ZERO
	direcao = direcao.normalized()
	var evasao := _calcular_vetor_evasao_bots()
	if evasao.length_squared() > 0.001:
		direcao = (direcao + evasao * forca_evasao_bots).normalized()
	return direcao

func _calcular_vetor_evasao_bots() -> Vector3:
	var evasao := Vector3.ZERO
	for bot in get_tree().get_nodes_in_group("time_b"):
		if not (bot is Node3D) or (bot.has_meta("congelado") and bool(bot.get_meta("congelado"))):
			continue
		var diferenca: Vector3 = global_position - bot.global_position
		diferenca.y = 0.0
		var distancia := diferenca.length()
		if distancia > 0.01 and distancia < distancia_evasao_bots:
			evasao += diferenca.normalized() * ((distancia_evasao_bots - distancia) / distancia_evasao_bots)
	return evasao

func _limitar_ao_lado_positivo(direcao: Vector3, delta: float) -> Vector3:
	if direcao.z < 0.0:
		var z_minimo := 0.05
		var passo_z := maxf(velocidade * delta, 0.001)
		var componente_minima := (z_minimo - global_position.z) / passo_z
		direcao.z = maxf(direcao.z, componente_minima)
	return direcao
