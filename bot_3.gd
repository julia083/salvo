
extends CharacterBody3D

@export var velocidade: float = 5.0
@export var gravidade: float = 9.8
@export var distancia_pegar_bandeira: float = 0.9
@export var altura_bandeira_carregada: float = 0.7

var bandeira_carregada: Node3D = null
var offset_visual_bandeira: Vector3 = Vector3.ZERO

func _ready() -> void:
	var bandeiras := get_tree().root.find_child("bandeira", true, false)
	if not bandeiras:
		return

	for bandeira in bandeiras.get_children():
		if bandeira.name in ["flag1", "flag2", "flag3"] and bandeira is RigidBody3D:
			# Impede que o corpo físico tombe antes de o jogador encostar nele.
			bandeira.freeze = true
			bandeira.lock_rotation = true

func _physics_process(delta):
	var z_anterior := global_position.z

	# Captura as teclas de movimentação
	var input_dir = Input.get_vector(
		"mover-esquerda",
		"mover_direita",
		"mover_frente",
        "mover_tras"
	)

	# Calcula a direção
	var direcao = (transform.basis * Vector3(input_dir.x, 0, input_dir.y)).normalized()

	# Movimenta o personagem
	if direcao:
		velocity.x = direcao.x * velocidade
		velocity.z = direcao.z * velocidade
	else:
		velocity.x = move_toward(velocity.x, 0, velocidade)
		velocity.z = move_toward(velocity.z, 0, velocidade)

	# Aplica gravidade
	if not is_on_floor():
		velocity.y -= gravidade * delta

	# Executa o movimento
	move_and_slide()
	_atualizar_bandeira(z_anterior)

func _atualizar_bandeira(z_anterior: float) -> void:
	if is_instance_valid(bandeira_carregada):
		# A linha central separa os campos: o lado aliado fica em z >= 0.
		if z_anterior < 0.0 and global_position.z >= 0.0:
			bandeira_carregada.queue_free()
			bandeira_carregada = null
			return

		bandeira_carregada.global_position = global_position + Vector3(0.0, altura_bandeira_carregada, 0.0) + offset_visual_bandeira
		return

	# Usa o contato físico reportado pelo CharacterBody3D como captura principal.
	for indice in get_slide_collision_count():
		var corpo := get_slide_collision(indice).get_collider() as Node3D
		if corpo and corpo.name in ["flag5", "flag6", "flag4"]:
			_pegar_bandeira(corpo)
			return

	var bandeiras := get_tree().root.find_child("bandeira", true, false)
	if not bandeiras:
		return

	for bandeira in bandeiras.get_children():
		if bandeira.name not in ["flag1", "flag2", "flag3"]:
			continue

		var colisor := bandeira.find_child("CollisionShape3D", false, false) as Node3D
		var posicao_bandeira: Vector3 = colisor.global_position if colisor else bandeira.global_position
		var distancia := Vector2(
			global_position.x - posicao_bandeira.x,
			global_position.z - posicao_bandeira.z
		).length()
		if distancia <= distancia_pegar_bandeira:
			_pegar_bandeira(bandeira)
			return

func _pegar_bandeira(bandeira: Node3D) -> void:
	var colisor := bandeira.find_child("CollisionShape3D", false, false) as Node3D
	var posicao_bandeira: Vector3 = colisor.global_position if colisor else bandeira.global_position
	bandeira_carregada = bandeira
	offset_visual_bandeira = bandeira.global_position - posicao_bandeira
	if bandeira_carregada is RigidBody3D:
		var corpo_bandeira := bandeira_carregada as RigidBody3D
		corpo_bandeira.freeze = true
		corpo_bandeira.linear_velocity = Vector3.ZERO
		corpo_bandeira.angular_velocity = Vector3.ZERO
		# A bandeira acompanha visualmente o jogador, sem colidir com ele.
		corpo_bandeira.collision_layer = 0
		corpo_bandeira.collision_mask = 0
	bandeira_carregada.global_position = global_position + Vector3(0.0, altura_bandeira_carregada, 0.0) + offset_visual_bandeira
