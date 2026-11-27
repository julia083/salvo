extends CanvasLayer

@onready var placar: RichTextLabel = $Placar

func _ready() -> void:
	var gerenciador := get_parent().get_node_or_null("bandeira")
	if not gerenciador:
		return
	gerenciador.connect("placar_atualizado", _atualizar_placar)
	_atualizar_placar(
		int(gerenciador.get("pontuacao_vermelha")),
		int(gerenciador.get("pontuacao_azul"))
	)

func _atualizar_placar(pontuacao_vermelha: int, pontuacao_azul: int) -> void:
	placar.text = "[center][font_size=26][b][color=#ff5555]VERMELHO: %d[/color]    [color=#6699ff]AZUL: %d[/color][/b][/font_size][/center]" % [pontuacao_vermelha, pontuacao_azul]
