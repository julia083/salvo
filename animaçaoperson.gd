extends CharacterBody3D

@export var velocidade: float = 4.2
@export var gravidade: float = 9.8
@export var distancia_interacao: float = 1.4

var alvo_atual: Node3D = null
var direcao_patrulha: float = 1.0

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

	alvo_atual = _escolher_alvo()
	if is_instance_valid(alvo_atual):
		var diferenca := alvo_atual.global_position - global_position
		diferenca.y = 0.0
		if diferenca.length() <= distancia_interacao:
			_interagir_com_alvo(alvo_atual)
			velocity.x = 0.0
			velocity.z = 0.0
		else:
			var direcao := diferenca.normalized()
			velocity.x = direcao.x * velocidade
			velocity.z = direcao.z * velocidade
			look_at(global_position + direcao, Vector3.UP)
	else:
		_patrulhar_sem_alvo()

	move_and_slide()

func _escolher_alvo() -> Node3D:
	# Primeiro socorre qualquer aliado congelado (bots 2 e 3); depois caça jogadores ativos.
	var aliado_congelado := _mais_proximo_em_grupo("time_b", true)
	if aliado_congelado:
		return aliado_congelado
	return _mais_proximo_em_grupo("time_a", false)

func _mais_proximo_em_grupo(grupo: String, procurar_congelado: bool) -> Node3D:
	var mais_proximo: Node3D = null
	var menor_distancia := INF
	for personagem in get_tree().get_nodes_in_group(grupo):
		if not (personagem is Node3D) or personagem == self:
			continue
		var congelado: bool = false
		if personagem.has_meta("congelado"):
			congelado = bool(personagem.get_meta("congelado"))
		if congelado != procurar_congelado:
			continue
		var distancia := global_position.distance_squared_to(personagem.global_position)
		if distancia < menor_distancia:
			menor_distancia = distancia
			mais_proximo = personagem
	return mais_proximo

func _interagir_com_alvo(alvo: Node3D) -> void:
	var componente := alvo.get_node_or_null("Congelamento") as Congelamento
	if not componente:
		return
	if componente.esta_congelado:
		componente.descongelar()
	else:
		componente.congelar()

func _patrulhar_sem_alvo() -> void:
	if global_position.x >= 10.5:
		direcao_patrulha = -1.0
	elif global_position.x <= -10.5:
		direcao_patrulha = 1.0
	velocity.x = direcao_patrulha * velocidade
	velocity.z = 0.0
