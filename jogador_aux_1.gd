extends CharacterBody3D

@export var velocidade: float = 3.8
@export var gravidade: float = 9.8
@export var distancia_interacao: float = 2.2
@export var alcance_z: float = 3.5
@export var limite_x: float = 10.5

var direcao_patrulha: float = -1.0

func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= gravidade * delta
	else:
		velocity.y = 0.0

	if has_meta("congelado") and bool(get_meta("congelado")):
		velocity.x = 0.0
		velocity.z = 0.0
		move_and_slide()
		return

	var bot_alvo := _encontrar_bot_invasor()
	if is_instance_valid(bot_alvo):
		_perseguir_no_eixo_x(bot_alvo)
	else:
		_patrulhar()

	# Este defensor mantém sempre z fixo e só se desloca no eixo X.
	velocity.z = 0.0
	move_and_slide()

func _encontrar_bot_invasor() -> Node3D:
	var mais_proximo: Node3D = null
	var menor_distancia := INF
	for bot in get_tree().get_nodes_in_group("time_b"):
		if not (bot is Node3D) or bot.name not in ["bot2", "bot3"]:
			continue
		if bot.global_position.z < 0.0:
			continue
		var componente := bot.get_node_or_null("Congelamento") as Congelamento
		if not componente or componente.esta_congelado:
			continue
		var diferenca_z := absf(bot.global_position.z - global_position.z)
		if diferenca_z > alcance_z:
			continue
		var distancia_x := absf(bot.global_position.x - global_position.x)
		if distancia_x < menor_distancia:
			menor_distancia = distancia_x
			mais_proximo = bot
	return mais_proximo

func _perseguir_no_eixo_x(bot: Node3D) -> void:
	var diferenca_x := bot.global_position.x - global_position.x
	var diferenca_z := absf(bot.global_position.z - global_position.z)
	var distancia := Vector2(diferenca_x, diferenca_z).length()
	if distancia <= distancia_interacao:
		var componente := bot.get_node_or_null("Congelamento") as Congelamento
		if componente and not componente.esta_congelado:
			componente.congelar()
		velocity.x = 0.0
		return

	if absf(diferenca_x) > 0.45:
		velocity.x = signf(diferenca_x) * velocidade
		look_at(Vector3(bot.global_position.x, global_position.y, global_position.z), Vector3.UP)
	else:
		velocity.x = 0.0

func _patrulhar() -> void:
	if global_position.x >= limite_x:
		direcao_patrulha = -1.0
	elif global_position.x <= -limite_x:
		direcao_patrulha = 1.0
	velocity.x = direcao_patrulha * velocidade
