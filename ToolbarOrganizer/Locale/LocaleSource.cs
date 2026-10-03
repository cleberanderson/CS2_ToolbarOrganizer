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
                { Ui("AutoSaved"), "Every change is saved immediately" },
                { Ui("LeftBar"), "Left toolbar" },
                { Ui("RightBar"), "Right toolbar" },
                { Ui("OrderAZ"), "A-Z" },
                { Ui("OrderZA"), "Z-A" },
                { Ui("Reorder"), "Reorder" },
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
                { Ui("AutoSaved"), "Cada alteração é gravada na hora" },
                { Ui("LeftBar"), "Barra esquerda" },
                { Ui("RightBar"), "Barra direita" },
                { Ui("OrderAZ"), "A-Z" },
                { Ui("OrderZA"), "Z-A" },
                { Ui("Reorder"), "Reordenar" },
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
