extends CanvasLayer

@onready var placar: RichTextLabel = $Placar
@onready var tela_vitoria: Control = $TelaVitoria
@onready var mensagem_vitoria: Label = $TelaVitoria/Conteudo/Mensagem
@onready var botao_reiniciar: Button = $TelaVitoria/Conteudo/Botoes/Reiniciar
@onready var botao_encerrar: Button = $TelaVitoria/Conteudo/Botoes/Encerrar

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	tela_vitoria.process_mode = Node.PROCESS_MODE_ALWAYS
	botao_reiniciar.pressed.connect(_reiniciar_partida)
	botao_encerrar.pressed.connect(_encerrar_partida)
	var gerenciador := get_parent().get_node_or_null("bandeira")
	if not gerenciador:
		return
	gerenciador.connect("placar_atualizado", _atualizar_placar)
	gerenciador.connect("vitoria_declarada", _mostrar_vitoria)
	_atualizar_placar(
		int(gerenciador.get("pontuacao_vermelha")),
		int(gerenciador.get("pontuacao_azul"))
	)

func _atualizar_placar(pontuacao_vermelha: int, pontuacao_azul: int) -> void:
	placar.text = "[center][font_size=26][b][color=#ff5555]VERMELHO: %d[/color]    [color=#6699ff]AZUL: %d[/color][/b][/font_size][/center]" % [pontuacao_vermelha, pontuacao_azul]

func _mostrar_vitoria(equipe_vencedora: String) -> void:
	mensagem_vitoria.text = "VITÓRIA DA EQUIPE %s" % equipe_vencedora
	tela_vitoria.visible = true
	botao_reiniciar.grab_focus()

func _reiniciar_partida() -> void:
	get_tree().paused = false
	get_tree().reload_current_scene()

func _encerrar_partida() -> void:
	get_tree().quit()
