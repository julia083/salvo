class_name Equipe
extends Node

enum TimeEquipe { A, B }

@export var time: TimeEquipe = TimeEquipe.A
@export var cor_time_a: Color = Color(0.9, 0.1, 0.1)
@export var cor_time_b: Color = Color(0.1, 0.3, 0.9)
## Nome do material do corpo, como aparece no Blender
@export var nome_material_corpo: String = "Materiais"

func _ready():
	var pai = get_parent()
	# Coloca o personagem em um grupo, para o código achar quem é de cada time
	pai.add_to_group("time_a" if time == TimeEquipe.A else "time_b")
	aplicar_cor()

func aplicar_cor():
	var cor = cor_time_a if time == TimeEquipe.A else cor_time_b
	var achou = false

	for malha in get_parent().find_children("*", "MeshInstance3D", true, false):
		for i in malha.get_surface_override_material_count():
			var mat = malha.get_active_material(i)
			if mat is StandardMaterial3D and mat.resource_name == nome_material_corpo:
				var novo = mat.duplicate() as StandardMaterial3D
				novo.albedo_color = cor
				novo.metallic = 0.0
				malha.set_surface_override_material(i, novo)
				achou = true

	if not achou:
		push_warning("Equipe: material '%s' não encontrado em %s" % [nome_material_corpo, get_parent().name])
