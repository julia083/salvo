extends CharacterBody3D

@export var velocidade: float = 3.5
@export var gravidade: float = 9.8

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
		# Calcula a direção apontando para o alvo mais próximo usando global_position (posição real no mundo 3D)
		var direcao = (alvo_atual.global_position - global_position)
		direcao.y = 0 # Mantém o movimento apenas no plano horizontal
		
		if direcao.length() > 0.1:
			direcao = direcao.normalized()

			# Move o bot em direção ao alvo
			velocity.x = direcao.x * velocidade
			velocity.z = direcao.z * velocidade

			# Faz o bot olhar para o alvo usando a posição global
			look_at(Vector3(alvo_atual.global_position.x, global_position.y, alvo_atual.global_position.z), Vector3.UP)
		else:
			velocity.x = move_toward(velocity.x, 0, velocidade)
			velocity.z = move_toward(velocity.z, 0, velocidade)
	else:
		velocity.x = move_toward(velocidade, 0, velocidade)
		velocity.z = move_toward(velocidade, 0, velocidade)

	move_and_slide()

func encontrar_jogador_mais_proximo() -> Node3D:
	# Procura de forma segura pelo nó contêiner "jogadores" em qualquer lugar da cena principal
	var no_jogadores = get_tree().root.find_child("jogadores", true, false)
	
	if not no_jogadores:
		return null
		
	var lista_jogadores = no_jogadores.get_children()
	var mais_proximo: Node3D = null
	var menor_distancia: float = INF
	
	for jogador in lista_jogadores:
		if jogador is Node3D:
			# Usa a distância real no mundo 3D (global_position)
			var distancia = global_position.distance_to(jogador.global_position)
			if distancia < menor_distancia:
				menor_distancia = distancia
				mais_proximo = jogador
				
	return mais_proximo
