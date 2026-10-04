using System.Collections.Generic;
using Colossal;

namespace ToolbarOrganizer.Locale
{
    /// <summary>
    /// Texts of the options page and of the in-game UI of the mod.
    /// Stage 1 ships English and Brazilian Portuguese; every other game language receives the English
    /// texts for now (the remaining languages of the specification come with the publishing stage).
    /// </summary>
    public class LocaleSource : IDictionarySource
    {
        /// <summary>Prefix of the texts used by the in-game UI (read from TypeScript).</summary>
        public const string kUiPrefix = Mod.kId + ".UI";

        private readonly Setting m_Setting;
        private readonly string m_LocaleId;

        public LocaleSource(Setting setting, string localeId)
        {
            m_Setting = setting;
            m_LocaleId = localeId;
        }

        private static string Ui(string key)
        {
            return kUiPrefix + "[" + key + "]";
        }

        public IEnumerable<KeyValuePair<string, string>> ReadEntries(IList<IDictionaryEntryError> errors, Dictionary<string, int> indexCounts)
        {
            return m_LocaleId == "pt-BR" ? Portuguese() : English();
        }

        private Dictionary<string, string> English()
        {
            return new Dictionary<string, string>
            {
                { m_Setting.GetSettingsLocaleID(), "Toolbar Organizer" },
                { m_Setting.GetOptionTabLocaleID(Setting.kSection), "General" },

                { m_Setting.GetOptionGroupLocaleID(Setting.kGeneralGroup), "General" },
                { m_Setting.GetOptionGroupLocaleID(Setting.kMaintenanceGroup), "Maintenance" },

                { m_Setting.GetOptionLabelLocaleID(nameof(Setting.Enabled)), "Enable Toolbar Organizer" },
                { m_Setting.GetOptionDescLocaleID(nameof(Setting.Enabled)), "Turns the mod on or off. With the mod off, the toolbars go back to the game default and the settings are kept." },

                { m_Setting.GetOptionLabelLocaleID(nameof(Setting.ResetAll)), "Reset Settings" },
                { m_Setting.GetOptionDescLocaleID(nameof(Setting.ResetAll)), "Erases all settings of the mod: order, groups, edited names, positions and sizes. The toolbars go back to alphabetical order." },
                { m_Setting.GetOptionWarningLocaleID(nameof(Setting.ResetAll)), "This erases all settings of the mod: order, groups, edited names, positions and sizes. Continue?" },

                { Ui("Title"), "Toolbar Organizer" },
                { Ui("AutoSaved"), "Every change is saved automatically, as soon as it is made." },
                { Ui("LeftBar"), "Left toolbar" },
                { Ui("RightBar"), "Right toolbar" },
                { Ui("OrderAZ"), "A\u2192Z" },
                { Ui("OrderZA"), "Z\u2192A" },
                { Ui("Reorder"), "Reorder" },
                { Ui("Hide"), "Hide" },
                { Ui("HideTip"), "Hides the buttons and the groups of this toolbar, like the Collapse button." },
                { Ui("CollapseTip"), "Collapse: hides the buttons and the groups of this toolbar." },
                { Ui("ExpandTip"), "Expand: shows the buttons and the groups of this toolbar." },
                { Ui("MoreTip"), "More: shows the mods that do not fit in the rows of the toolbar." },
                { Ui("ResizeTip"), "Resize: drag to change the number of columns of the panel, from 3 to 10." },
                { Ui("OrderManual"), "Manual" },
                { Ui("Restore"), "Restore" },
                { Ui("RestoreTip"), "Restore: the groups of this toolbar are deleted, its buttons that are on the other toolbar or in a group return to it, the buttons of the other toolbar return to theirs, the order goes back to A\u2192Z and the toolbar is expanded. The edited names are kept." },
                { Ui("RestoreConfirm"), "This restores this toolbar: its groups are deleted, its buttons that are on the other toolbar or in a group return to it, the buttons of the other toolbar return to theirs, the order goes back to A\u2192Z and the toolbar is expanded. The edited names are kept. Continue?" },
                { Ui("EditMode"), "Edit mode" },
                { Ui("EditModeTip"), "Edit mode: lets you drag the buttons of the toolbars and edit their names. While it is on, a click on a button does not open its mod." },
                { Ui("EditBanner"), "Edit mode on: drag to organize" },
                { Ui("EditDone"), "Done" },
                { Ui("ItemName"), "Item name" },
                { Ui("ClearName"), "Clear" },
                { Ui("ClearNameTip"), "Clear: empties the field. With the field empty, the item goes back to the official name of its mod." },
                { Ui("MoveToLeft"), "Move to the left toolbar" },
                { Ui("MoveToRight"), "Move to the right toolbar" },
                { Ui("MoveTip"), "Moves this button to the other toolbar. In A\u2192Z or Z\u2192A it enters by its name; in Manual, at the end." },
                { Ui("Groups"), "Groups" },
                { Ui("NewGroup"), "+ New group" },
                { Ui("RestorePanelPositions"), "Restore panel positions" },
                { Ui("RestorePanelSizes"), "Restore panel sizes" },
                { Ui("GroupName"), "Group name" },
                { Ui("Bar"), "Toolbar" },
                { Ui("Left"), "Left" },
                { Ui("Right"), "Right" },
                { Ui("GroupNameTaken"), "There is already a group with this name." },
                { Ui("RenameGroup"), "Rename group" },
                { Ui("DeleteGroup"), "Delete group" },
                { Ui("DeleteGroupConfirm"), "This deletes the group \u201c{0}\u201d. Its items return to their own toolbar, or to the last toolbar they were on before entering the group. Continue?" },
                { Ui("GroupOptions"), "Group options" },
                { Ui("ClosePanel"), "Close" },
                { Ui("GroupOrderAZ"), "Order: A\u2192Z" },
                { Ui("GroupOrderZA"), "Order: Z\u2192A" },
                { Ui("GroupOrderManual"), "Order: Manual" },
                { Ui("Current"), "(current)" },
                { Ui("ShowNames"), "Names under the icons" },
                { Ui("RestoreGroupOrder"), "Restore the order of the group" },
                { Ui("PanelToGroup"), "Return the panel to the place of the group" },
                { Ui("RestorePanelSize"), "Restore the size of the panel" },
                { Ui("PutInGroup"), "Put in a group" },
                { Ui("TakeFromGroup"), "Take out of the group" },
                { Ui("TakeFromGroupTip"), "Takes this button out of the group. It returns to its own toolbar, or to the last one it was on before entering the group." },
                { Ui("PanelFull"), "Panel full!" },
                { Ui("MovePanelTip"), "Move: drag to put the panel anywhere on the screen. Right click: hide or show the title bar." },
                { Ui("HideTitleBar"), "Hide title bar" },
                { Ui("ShowTitleBar"), "Show title bar" },
                { Ui("OpenPanelMenu"), "Open menu" },
                { Ui("EditGroup"), "Edit group: name, toolbar and order" },
                { Ui("RowBarTip"), "Toolbar of the group: click to change." },
                { Ui("RowOrderTip"), "Order of the items of the group: click to change." },
                { Ui("HidePanelTitles"), "Hide panel titles" },
                { Ui("ShowPanelTitles"), "Show panel titles" },
                { Ui("HidePanelTitlesTip"), "Hides the title bar of the panels of every group." },
                { Ui("ShowPanelTitlesTip"), "Shows the title bar of the panels of every group." },
                { Ui("ResetPanels"), "Reset panels (Global)" },
                { Ui("ResetPanelsTip"), "Every panel of group goes back to its original state: title bar shown, standard size and place under the button of its group." },
                { Ui("ResetPanelsConfirm"), "This restores every panel of group: the title bar is shown again, the size goes back to the standard and the panel goes back under the button of its group. Continue?" },
                { Ui("ResizePanelTip"), "Resize: drag the right edge for the columns, the bottom edge for the rows, or this corner for both." },
                { Ui("RestorePanelPositionsTip"), "Every panel of group goes back to the place of its group, under its button." },
                { Ui("RestorePanelSizesTip"), "Every panel of group goes back to its standard size." },
                { Ui("General"), "General" },
                { Ui("RestoreAll"), "Reset Settings" },
                { Ui("RestoreAllDesc"), "Erases all settings of the mod: order, groups, edited names, positions and sizes. The toolbars go back to alphabetical order." },
                { Ui("RestoreAllConfirm"), "This erases all settings of the mod: order, groups, edited names, positions and sizes. Continue?" },
                { Ui("Cancel"), "Cancel" },
                { Ui("Confirm"), "Confirm" },
            };
        }

        private Dictionary<string, string> Portuguese()
        {
            return new Dictionary<string, string>
            {
                { m_Setting.GetSettingsLocaleID(), "Toolbar Organizer" },
                { m_Setting.GetOptionTabLocaleID(Setting.kSection), "Geral" },

                { m_Setting.GetOptionGroupLocaleID(Setting.kGeneralGroup), "Geral" },
                { m_Setting.GetOptionGroupLocaleID(Setting.kMaintenanceGroup), "Manutenção" },

                { m_Setting.GetOptionLabelLocaleID(nameof(Setting.Enabled)), "Ativar o Toolbar Organizer" },
                { m_Setting.GetOptionDescLocaleID(nameof(Setting.Enabled)), "Ativa ou desativa o mod. Com o mod desativado, as barras voltam ao padrão do jogo e as configurações são mantidas." },

                { m_Setting.GetOptionLabelLocaleID(nameof(Setting.ResetAll)), "Redefinir Configurações" },
                { m_Setting.GetOptionDescLocaleID(nameof(Setting.ResetAll)), "Apaga todas as configurações do mod: ordem, grupos, nomes editados, posições e dimensões. As barras voltam à ordem alfabética." },
                { m_Setting.GetOptionWarningLocaleID(nameof(Setting.ResetAll)), "Isso apaga todas as configurações do mod: ordem, grupos, nomes editados, posições e dimensões. Continuar?" },

                { Ui("Title"), "Toolbar Organizer" },
                { Ui("AutoSaved"), "Toda alteração é salva automaticamente, no momento em que é feita." },
                { Ui("LeftBar"), "Barra esquerda" },
                { Ui("RightBar"), "Barra direita" },
                { Ui("OrderAZ"), "A\u2192Z" },
                { Ui("OrderZA"), "Z\u2192A" },
                { Ui("Reorder"), "Reordenar" },
                { Ui("Hide"), "Ocultar" },
                { Ui("HideTip"), "Oculta os botões e os grupos desta barra, como o botão Recolher." },
                { Ui("CollapseTip"), "Recolher: oculta os botões e os grupos desta barra." },
                { Ui("ExpandTip"), "Expandir: mostra os botões e os grupos desta barra." },
                { Ui("MoreTip"), "Mais: mostra os mods que não cabem nas linhas da barra." },
                { Ui("ResizeTip"), "Redimensionar: arraste para mudar a quantidade de colunas do painel, de 3 a 10." },
                { Ui("OrderManual"), "Manual" },
                { Ui("Restore"), "Restaurar" },
                { Ui("RestoreTip"), "Restaurar: os grupos desta barra são excluídos, os botões dela que estão na outra barra ou em grupos voltam para ela, os botões da outra barra voltam para a barra deles, a ordem volta a A\u2192Z e a barra fica expandida. Os nomes editados são mantidos." },
                { Ui("RestoreConfirm"), "Isso restaura esta barra: os grupos dela são excluídos, os botões dela que estão na outra barra ou em grupos voltam para ela, os botões da outra barra voltam para a barra deles, a ordem volta a A\u2192Z e a barra fica expandida. Os nomes editados são mantidos. Continuar?" },
                { Ui("EditMode"), "Modo de edição" },
                { Ui("EditModeTip"), "Modo de edição: permite arrastar os botões das barras e editar os nomes. Com ele ativo, clicar em um botão não aciona o mod dele." },
                { Ui("EditBanner"), "Modo de edição ativo: arraste para organizar" },
                { Ui("EditDone"), "Concluir" },
                { Ui("ItemName"), "Nome do item" },
                { Ui("ClearName"), "Limpar" },
                { Ui("ClearNameTip"), "Limpar: esvazia o campo. Com o campo vazio, o item volta a usar o nome oficial do mod." },
                { Ui("MoveToLeft"), "Mover para a barra esquerda" },
                { Ui("MoveToRight"), "Mover para a barra direita" },
                { Ui("MoveTip"), "Move este botão para a outra barra. Em A\u2192Z ou Z\u2192A ele entra pelo nome; em Manual, no fim." },
                { Ui("Groups"), "Grupos" },
                { Ui("NewGroup"), "+ Novo grupo" },
                { Ui("RestorePanelPositions"), "Restaurar posição dos painéis" },
                { Ui("RestorePanelSizes"), "Restaurar dimensão dos painéis" },
                { Ui("GroupName"), "Nome do grupo" },
                { Ui("Bar"), "Barra" },
                { Ui("Left"), "Esquerda" },
                { Ui("Right"), "Direita" },
                { Ui("GroupNameTaken"), "Já existe um grupo com esse nome." },
                { Ui("RenameGroup"), "Renomear grupo" },
                { Ui("DeleteGroup"), "Excluir grupo" },
                { Ui("DeleteGroupConfirm"), "Isso exclui o grupo \u201c{0}\u201d. Os itens dele voltam para a barra de origem ou para a última barra em que estavam antes de entrar no grupo. Continuar?" },
                { Ui("GroupOptions"), "Opções do grupo" },
                { Ui("ClosePanel"), "Fechar" },
                { Ui("GroupOrderAZ"), "Ordem: A\u2192Z" },
                { Ui("GroupOrderZA"), "Ordem: Z\u2192A" },
                { Ui("GroupOrderManual"), "Ordem: Manual" },
                { Ui("Current"), "(atual)" },
                { Ui("ShowNames"), "Nomes sob os ícones" },
                { Ui("RestoreGroupOrder"), "Restaurar ordem do grupo" },
                { Ui("PanelToGroup"), "Voltar o painel à posição do grupo" },
                { Ui("RestorePanelSize"), "Restaurar dimensão do painel" },
                { Ui("PutInGroup"), "Colocar em grupo" },
                { Ui("TakeFromGroup"), "Tirar do grupo" },
                { Ui("TakeFromGroupTip"), "Tira este botão do grupo. Ele volta para a barra de origem ou para a última em que estava antes de entrar no grupo." },
                { Ui("PanelFull"), "Painel cheio!" },
                { Ui("MovePanelTip"), "Mover: arraste para colocar o painel em qualquer lugar da tela. Botão direito: ocultar ou exibir a barra de título." },
                { Ui("HideTitleBar"), "Ocultar barra de título" },
                { Ui("ShowTitleBar"), "Exibir barra de título" },
                { Ui("OpenPanelMenu"), "Abrir menu" },
                { Ui("EditGroup"), "Editar grupo: nome, barra e ordem" },
                { Ui("RowBarTip"), "Barra do grupo: clique para trocar." },
                { Ui("RowOrderTip"), "Ordem dos itens do grupo: clique para trocar." },
                { Ui("HidePanelTitles"), "Ocultar títulos dos painéis" },
                { Ui("ShowPanelTitles"), "Exibir títulos dos painéis" },
                { Ui("HidePanelTitlesTip"), "Oculta a barra de título dos painéis de todos os grupos." },
                { Ui("ShowPanelTitlesTip"), "Exibe a barra de título dos painéis de todos os grupos." },
                { Ui("ResetPanels"), "Resetar painéis (Global)" },
                { Ui("ResetPanelsTip"), "Todos os painéis de grupo voltam ao estado original: barra de título à vista, tamanho padrão e lugar sob o botão do grupo." },
                { Ui("ResetPanelsConfirm"), "Isso restaura todos os painéis de grupo: a barra de título volta a aparecer, o tamanho volta ao padrão e o painel volta para baixo do botão do grupo. Continuar?" },
                { Ui("ResizePanelTip"), "Redimensionar: arraste a borda direita para as colunas, a borda de baixo para as linhas, ou este canto para as duas." },
                { Ui("RestorePanelPositionsTip"), "Todos os painéis de grupo voltam para a posição do grupo, abaixo do botão dele." },
                { Ui("RestorePanelSizesTip"), "Todos os painéis de grupo voltam ao tamanho padrão." },
                { Ui("General"), "Geral" },
                { Ui("RestoreAll"), "Redefinir Configurações" },
                { Ui("RestoreAllDesc"), "Apaga todas as configurações do mod: ordem, grupos, nomes editados, posições e dimensões. As barras voltam à ordem alfabética." },
                { Ui("RestoreAllConfirm"), "Isso apaga todas as configurações do mod: ordem, grupos, nomes editados, posições e dimensões. Continuar?" },
                { Ui("Cancel"), "Cancelar" },
                { Ui("Confirm"), "Confirmar" },
            };
        }

        public void Unload()
        {
        }
    }
}
