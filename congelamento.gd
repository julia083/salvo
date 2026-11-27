class_name Congelamento
extends Node

signal congelado(personagem: Node3D)
signal descongelado(personagem: Node3D)

## Distância horizontal máxima entre centros para considerar toque (< 1m entre cápsulas).
@export var distancia_toque: float = 1.2
## Tempo de recarga (em segundos) após congelar um adversário.
@export var tempo_recarga_congelar: float = 5.0
## Breve imunidade após ser descongelado, evitando recongelamento instantâneo no mesmo frame.
@export var imunidade_pos_descongelar: float = 1.0
## Cor aplicada ao personagem quando congelado.
@export var cor_congelado: Color = Color(0.35, 0.85, 1.0, 1.0)
## Cor da camada visual de gelo ao redor do personagem.
@export var cor_gelo_aura: Color = Color(0.55, 0.9, 1.0, 0.35)

var esta_congelado: bool = false
var tempo_restante_recarga: float = 0.0
var tempo_imunidade: float = 0.0

var _pai: Node3D = null
var _materiais_originais: Dictionary = {}
var _material_congelado: StandardMaterial3D = null
var _gelo_visual: MeshInstance3D = null

func _ready() -> void:
	_pai = get_parent() as Node3D
	if not _pai:
		push_warning("Congelamento precisa ser filho de um Node3D.")
		return

	_garantir_grupo_time()
	_preparar_visual_gelo()
	_sincronizar_metadados()

func _physics_process(delta: float) -> void:
	if not is_instance_valid(_pai):
		return

	if tempo_restante_recarga > 0.0:
		tempo_restante_recarga = maxf(0.0, tempo_restante_recarga - delta)

	if tempo_imunidade > 0.0:
		tempo_imunidade = maxf(0.0, tempo_imunidade - delta)

	_sincronizar_metadados()

	if esta_congelado:
		return

	_verificar_toques()

func congelar() -> void:
	if esta_congelado or not is_instance_valid(_pai):
		return

	esta_congelado = true
	tempo_imunidade = 0.0
	_sincronizar_metadados()

	if _pai is CharacterBody3D:
		var corpo := _pai as CharacterBody3D
		corpo.velocity.x = 0.0
		corpo.velocity.z = 0.0

	_soltar_bandeira_se_houver()
	_pausar_animacoes(true)
	_aplicar_visual_congelado(true)
	congelado.emit(_pai)

func descongelar() -> void:
	if not esta_congelado or not is_instance_valid(_pai):
		return

	esta_congelado = false
	tempo_imunidade = imunidade_pos_descongelar
	_sincronizar_metadados()

	_aplicar_visual_congelado(false)
	_pausar_animacoes(false)
	descongelado.emit(_pai)

func _verificar_toques() -> void:
	var meu_time := _obter_grupo_time(_pai)
	if meu_time == "":
		return

	var grupo_inimigo := "time_b" if meu_time == "time_a" else "time_a"
	var candidatos: Array[Node3D] = []

	if _pai is CharacterBody3D:
		var corpo := _pai as CharacterBody3D
		for i in range(corpo.get_slide_collision_count()):
			var colisor := corpo.get_slide_collision(i).get_collider() as Node3D
			if colisor and colisor != _pai and not candidatos.has(colisor):
				candidatos.append(colisor)

	for grupo in [meu_time, grupo_inimigo]:
		for no in get_tree().get_nodes_in_group(grupo):
			if no is Node3D and no != _pai and not candidatos.has(no):
				if _esta_em_distancia_toque(_pai, no):
					candidatos.append(no)

	for outro in candidatos:
		if not is_instance_valid(outro):
			continue
		var outro_cong := _obter_componente(outro)
		if not outro_cong:
			continue

		var time_outro := _obter_grupo_time(outro)
		if time_outro == "":
			continue

		if time_outro == meu_time:
			# Descongelar aliado não precisa de tempo de recarga.
			if outro_cong.esta_congelado:
				outro_cong.descongelar()
		else:
			# Congelar adversário consome recarga de 5s.
			if not outro_cong.esta_congelado and outro_cong.tempo_imunidade <= 0.0 and tempo_restante_recarga <= 0.0:
				outro_cong.congelar()
				tempo_restante_recarga = tempo_recarga_congelar
				_sincronizar_metadados()

func _esta_em_distancia_toque(a: Node3D, b: Node3D) -> bool:
	var diff := a.global_position - b.global_position
	if absf(diff.y) > 2.2:
		return false
	return Vector2(diff.x, diff.z).length() <= distancia_toque

func _obter_componente(no: Node) -> Congelamento:
	for filho in no.get_children():
		if filho is Congelamento:
			return filho
	return null

func _garantir_grupo_time() -> void:
	if _pai.is_in_group("time_a") or _pai.is_in_group("time_b"):
		return
	var grupo := _obter_grupo_time(_pai)
	if grupo != "":
		_pai.add_to_group(grupo)

func _obter_grupo_time(no: Node) -> String:
	if no.is_in_group("time_a"):
		return "time_a"
	if no.is_in_group("time_b"):
		return "time_b"

	var equipe := no.find_child("Equipe", false, false)
	if equipe:
		var t = equipe.get("time")
		if t != null:
			return "time_a" if int(t) == 0 else "time_b"

	var pai_grupo := no.get_parent()
	if pai_grupo:
		if pai_grupo.name == "jogadores":
			return "time_a"
		if pai_grupo.name == "bots":
			return "time_b"

	return ""

func _sincronizar_metadados() -> void:
	if not is_instance_valid(_pai):
		return
	_pai.set_meta("congelado", esta_congelado)
	_pai.set_meta("imune_congelamento", tempo_imunidade > 0.0)
	_pai.set_meta("tempo_recarga_congelar", tempo_restante_recarga)

func _preparar_visual_gelo() -> void:
	_material_congelado = StandardMaterial3D.new()
	_material_congelado.albedo_color = cor_congelado
	_material_congelado.roughness = 0.15
	_material_congelado.metallic = 0.1
	_material_congelado.emission_enabled = true
	_material_congelado.emission = Color(0.25, 0.7, 0.95)
	_material_congelado.emission_energy_multiplier = 0.45

	var mat_aura := StandardMaterial3D.new()
	mat_aura.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat_aura.albedo_color = cor_gelo_aura
	mat_aura.roughness = 0.08
	mat_aura.emission_enabled = true
	mat_aura.emission = Color(0.45, 0.85, 1.0)
	mat_aura.emission_energy_multiplier = 0.35

	var capsula := CapsuleMesh.new()
	capsula.radius = 0.62
	capsula.height = 2.05

	_gelo_visual = MeshInstance3D.new()
	_gelo_visual.name = "GeloVisual"
	_gelo_visual.mesh = capsula
	_gelo_visual.material_override = mat_aura
	_gelo_visual.visible = false

	var colisor := _pai.find_child("CollisionShape3D", false, false) as Node3D
	if colisor:
		_gelo_visual.position = colisor.position
	else:
		_gelo_visual.position = Vector3(0.0, 0.9, 0.0)

	_pai.add_child.call_deferred(_gelo_visual)

func _aplicar_visual_congelado(congelar_visual: bool) -> void:
	if is_instance_valid(_gelo_visual):
		_gelo_visual.visible = congelar_visual

	if congelar_visual:
		_materiais_originais.clear()
		for malha in _pai.find_children("*", "MeshInstance3D", true, false):
			if malha == _gelo_visual or not (malha is MeshInstance3D):
				continue
			var m := malha as MeshInstance3D
			var salvos: Array = []
			for i in range(m.get_surface_override_material_count()):
				salvos.append(m.get_surface_override_material(i))
				m.set_surface_override_material(i, _material_congelado)
			_materiais_originais[m.get_instance_id()] = salvos
	else:
		for malha in _pai.find_children("*", "MeshInstance3D", true, false):
			if malha == _gelo_visual or not (malha is MeshInstance3D):
				continue
			var m := malha as MeshInstance3D
			var id := m.get_instance_id()
			if _materiais_originais.has(id):
				var salvos: Array = _materiais_originais[id]
				for i in range(mini(salvos.size(), m.get_surface_override_material_count())):
					m.set_surface_override_material(i, salvos[i])
		_materiais_originais.clear()

		var equipe := _pai.find_child("Equipe", false, false)
		if equipe and equipe.has_method("aplicar_cor"):
			equipe.aplicar_cor()

func _pausar_animacoes(pausar: bool) -> void:
	for anim in _pai.find_children("*", "AnimationPlayer", true, false):
		if anim is AnimationPlayer:
			if pausar:
				if anim.is_playing():
					anim.pause()
			else:
				if anim.assigned_animation != "":
					anim.play()

func _soltar_bandeira_se_houver() -> void:
	var alvo = _pai.get("bandeira_alvo")
	if alvo and is_instance_valid(alvo) and alvo is Node3D:
		var no_alvo := alvo as Node3D
		if no_alvo.has_meta("reservada_por") and no_alvo.get_meta("reservada_por") == _pai:
			no_alvo.remove_meta("reservada_por")
		_pai.set("bandeira_alvo", null)

	var bandeira = _pai.get("bandeira_carregada")
	if bandeira and is_instance_valid(bandeira) and bandeira is Node3D:
		var no_bandeira := bandeira as Node3D
		if no_bandeira.has_meta("carregada_por"):
			no_bandeira.remove_meta("carregada_por")
		if no_bandeira is RigidBody3D:
			var corpo := no_bandeira as RigidBody3D
			corpo.collision_layer = 1
			corpo.collision_mask = 1
		_pai.set("bandeira_carregada", null)
		if _pai.get("estado") != null:
			_pai.set("estado", 0)
