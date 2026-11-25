extends CharacterBody3D

@export var velocidade: float = 3.5
@export var gravidade: float = 9.8
@export var nome_animacao_andar: String = "AnimationPlayer" # Preencha aqui ou no Inspetor com o nome exato da animação

# Referência única ao nó AnimationPlayer filho deste CharacterBody3D
@onready var anim_player: AnimationPlayer = $AnimationPlayer

var alvo_atual: Node3D = null

func _physics_process(delta):
	# Aplica a gravidade se não estiver no chão
	if not is_on_floor():
		velocity.y -= gravidade * delta
	else:
		velocity.y = 0

	# Atualiza para encontrar o jogador mais próximo na cena inteira
	alvo_atual = encontrar_jogador_mais_proximo()

	if alvo_atual:
		var direcao = (alvo_atual.global_position - global_position)
		direcao.y = 0
		
		if direcao.length() > 0.1:
			direcao = direcao.normalized()

			velocity.x = direcao.x * velocidade
			velocity.z = direcao.z * velocidade

			look_at(Vector3(alvo_atual.global_position.x, global_position.y, alvo_atual.global_position.z), Vector3.UP)
		else:
			velocity.x = move_toward(velocity.x, 0, velocidade)
			velocity.z = move_toward(velocity.z, 0, velocidade)
	else:
		velocity.x = move_toward(velocity.x, 0, velocidade)
		velocity.z = move_toward(velocity.z, 0, velocidade)

	move_and_slide()
	atualizar_animacao()

func atualizar_animacao():
	if not anim_player or nome_animacao_andar == "":
		return
		
	var velocidade_horizontal = Vector2(velocity.x, velocity.z).length()
	
	if velocidade_horizontal > 0.1:
		if anim_player.current_animation != nome_animacao_andar:
			anim_player.play(nome_animacao_andar)
	else:
		if anim_player.is_playing():
			anim_player.stop()

func encontrar_jogador_mais_proximo() -> Node3D:
	var no_jogadores = get_tree().root.find_child("jogadores", true, false)
	
	if not no_jogadores:
		return null
		
	var lista_jogadores = no_jogadores.get_children()
	var mais_proximo: Node3D = null
	var menor_distancia: float = INF
	
	for jogador in lista_jogadores:
		if jogador is Node3D:
			var distancia = global_position.distance_to(jogador.global_position)
			if distancia < menor_distancia:
				menor_distancia = distancia
				mais_proximo = jogador
				
	return mais_proximo
