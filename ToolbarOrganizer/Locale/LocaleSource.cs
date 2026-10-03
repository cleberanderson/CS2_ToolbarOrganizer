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
                { Ui("RestoreTip"), "Restore: the buttons of this toolbar that are on the other one return to it, the buttons of the other toolbar return to theirs, the order goes back to A\u2192Z and the toolbar is expanded. The edited names are kept." },
                { Ui("RestoreConfirm"), "This restores this toolbar: its buttons that are on the other toolbar return to it, the buttons of the other toolbar return to theirs, the order goes back to A\u2192Z and the toolbar is expanded. The edited names are kept. Continue?" },
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
                { Ui("RestoreTip"), "Restaurar: os botões desta barra que estão na outra voltam para ela, os botões da outra barra voltam para a barra deles, a ordem volta a A\u2192Z e a barra fica expandida. Os nomes editados são mantidos." },
                { Ui("RestoreConfirm"), "Isso restaura esta barra: os botões dela que estão na outra barra voltam para ela, os botões da outra barra voltam para a barra deles, a ordem volta a A\u2192Z e a barra fica expandida. Os nomes editados são mantidos. Continuar?" },
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
