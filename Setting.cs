using Colossal.IO.AssetDatabase;
using Game.Modding;
using Game.Settings;
using ToolbarOrganizer.Data;
using ToolbarOrganizer.Diagnostics;

namespace ToolbarOrganizer
{
    /// <summary>
    /// Options page of the mod (game Options menu). Saved by the game in a .coc file.
    /// </summary>
    [FileLocation("ModsSettings/" + Mod.kId + "/" + Mod.kId)]
    [SettingsUIGroupOrder(kGeneralGroup, kMaintenanceGroup)]
    [SettingsUIShowGroupName(kGeneralGroup, kMaintenanceGroup)]
    public class Setting : ModSetting
    {
        public const string kSection = "Main";

        public const string kGeneralGroup = "General";
        public const string kMaintenanceGroup = "Maintenance";

        public Setting(IMod mod) : base(mod)
        {
        }

        /// <summary>
        /// Master switch. Off on a fresh install: the mod does nothing until the user turns it on.
        /// Turning it off puts the toolbars back to the game default and keeps the saved layout.
        /// </summary>
        [SettingsUISection(kSection, kGeneralGroup)]
        public bool Enabled { get; set; } = false;

        /// <summary>Full reset of the saved layout (order, names and every customization).</summary>
        [SettingsUIButton]
        [SettingsUIConfirmation]
        [SettingsUISection(kSection, kMaintenanceGroup)]
        public bool ResetAll
        {
            set
            {
                Log.Info("Reset of the saved layout requested from the options page");
                LayoutStore.Reset();
            }
        }

        public override void SetDefaults()
        {
            Enabled = false;
        }
    }
}
