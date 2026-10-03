using System;
using System.IO;
using Colossal.IO.AssetDatabase;
using Colossal.Logging;
using Game;
using Game.Modding;
using Game.SceneFlow;
using ToolbarOrganizer.Diagnostics;
using ToolbarOrganizer.Locale;
using ToolbarOrganizer.Systems;

namespace ToolbarOrganizer
{
    /// <summary>
    /// Entry point of the mod. Loads the settings, registers the options page and the UI system.
    /// </summary>
    public class Mod : IMod
    {
        /// <summary>Internal id: assembly name, UI module name, binding group and data folder.</summary>
        public const string kId = "ToolbarOrganizer";

        /// <summary>The game's logger for this mod. Use <see cref="Log"/> to write: it also feeds the complete log file.</summary>
        public static ILog log = LogManager.GetLogger(kId).SetShowsErrorsInUI(false);

        /// <summary>Settings shown in the game's Options menu.</summary>
        public static Setting Settings { get; private set; }

        /// <summary>Folder the mod was loaded from.</summary>
        public static string ModDirectory { get; private set; }

        public void OnLoad(UpdateSystem updateSystem)
        {
            Log.Open();

            try
            {
                // The game keeps a level per logger; without this the informative lines can be dropped.
                log.SetEffectiveness(Level.All);
            }
            catch (Exception e)
            {
                Log.Trace("The level of the game logger could not be set: " + e.Message);
            }

            Log.Info("OnLoad: Toolbar Organizer " + typeof(Mod).Assembly.GetName().Version + ", complete log at " + Log.FilePath);

            try
            {
                if (GameManager.instance.modManager.TryGetExecutableAsset(this, out var asset))
                {
                    ModDirectory = Path.GetDirectoryName(asset.path);
                    Log.Info("Mod loaded from " + asset.path);
                }

                Settings = new Setting(this);
                Settings.RegisterInOptionsUI();

                // One source per language of the game, so no raw text key is ever shown.
                var localization = GameManager.instance.localizationManager;
                foreach (var localeId in localization.GetSupportedLocales())
                {
                    try
                    {
                        localization.AddSource(localeId, new LocaleSource(Settings, localeId));
                    }
                    catch (Exception e)
                    {
                        Log.Warn("Texts not registered for " + localeId + ". " + e.Message);
                    }
                }

                AssetDatabase.global.LoadSettings(kId, Settings, new Setting(this));
                Log.Info("Settings loaded: Enabled=" + Settings.Enabled + ", game language=" + localization.activeLocaleId);

                updateSystem.UpdateAt<ToolbarOrganizerUISystem>(SystemUpdatePhase.UIUpdate);
                Log.Info("UI system registered");
            }
            catch (Exception e)
            {
                Log.Error("Toolbar Organizer failed to load; the game toolbars are left untouched.", e);
            }
        }

        public void OnDispose()
        {
            Log.Info("OnDispose");

            if (Settings != null)
            {
                Settings.UnregisterInOptionsUI();
                Settings = null;
            }

            Log.Close();
        }
    }
}
