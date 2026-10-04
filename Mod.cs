using System;
using System.IO;
using System.Reflection;
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

        /// <summary>
        /// Name of the address registered for the files of the mod ("coui://toolbarorganizer/"); empty when none
        /// could be registered, and the UI then uses the address shared by all the mods ("coui://ui-mods/").
        /// </summary>
        public static string ImagesHost { get; private set; } = string.Empty;

        /// <summary>Name of the mod's own address for its images.</summary>
        private const string kImagesHost = "toolbarorganizer";

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

                RegisterImagesHost();

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

        /// <summary>
        /// Registers an address of the game UI for the folder of the mod, so its images are read straight from
        /// it. The address shared by all the mods searches the folder of every installed mod for each file,
        /// which takes several seconds per image when many mods are installed. The call is made by name, so a
        /// change in that part of the game only turns this off: the shared address keeps working.
        /// </summary>
        private static void RegisterImagesHost()
        {
            ImagesHost = string.Empty;
            try
            {
                if (string.IsNullOrEmpty(ModDirectory) || !Directory.Exists(ModDirectory))
                {
                    Log.Warn("Own address of the images not registered: the folder of the mod is not known. The shared address is used.");
                    return;
                }

                var system = FindUISystem();
                var method = system != null ? FindHostMethod(system.GetType(), "AddHostLocation") : null;
                if (method == null)
                {
                    Log.Warn("Own address of the images not registered: the game UI has no way to register it here. The shared address is used.");
                    return;
                }

                method.Invoke(system, HostArguments(method, kImagesHost, ModDirectory));
                ImagesHost = kImagesHost;
                Log.Info("Own address of the images registered: coui://" + kImagesHost + "/ -> " + ModDirectory);
            }
            catch (Exception e)
            {
                ImagesHost = string.Empty;
                Log.Warn("Own address of the images not registered; the shared address is used. " + e);
            }
        }

        private static void UnregisterImagesHost()
        {
            if (string.IsNullOrEmpty(ImagesHost))
            {
                return;
            }

            try
            {
                var system = FindUISystem();
                var method = system != null ? FindHostMethod(system.GetType(), "RemoveHostLocation") : null;
                if (method != null)
                {
                    method.Invoke(system, HostArguments(method, kImagesHost, ModDirectory));
                    Log.Info("Own address of the images removed");
                }
            }
            catch (Exception e)
            {
                Log.Trace("The own address of the images could not be removed: " + e.Message);
            }

            ImagesHost = string.Empty;
        }

        /// <summary>The game's UI system (Colossal.UI.UIManager.defaultUISystem), found by name.</summary>
        private static object FindUISystem()
        {
            var manager = Type.GetType("Colossal.UI.UIManager, Colossal.UI");
            if (manager == null)
            {
                // Not where it is expected: looked for, by name, in the game's UI library.
                foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
                {
                    if (assembly.GetName().Name != "Colossal.UI")
                    {
                        continue;
                    }

                    foreach (var type in assembly.GetTypes())
                    {
                        if (type.Name == "UIManager")
                        {
                            manager = type;
                            break;
                        }
                    }
                }
            }

            if (manager == null)
            {
                return null;
            }

            const BindingFlags flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static | BindingFlags.Instance;
            var property = manager.GetProperty("defaultUISystem", flags);
            var getter = property != null ? property.GetGetMethod(true) : null;
            if (getter == null)
            {
                return null;
            }

            if (getter.IsStatic)
            {
                return property.GetValue(null, null);
            }

            // Kept by an instance of the manager: that instance is read from a static member of its own type.
            foreach (var member in manager.GetProperties(flags))
            {
                var memberGetter = member.GetGetMethod(true);
                if (member.PropertyType == manager && memberGetter != null && memberGetter.IsStatic)
                {
                    var instance = member.GetValue(null, null);
                    return instance != null ? property.GetValue(instance, null) : null;
                }
            }

            return null;
        }

        /// <summary>A public method with that name whose first parameter is the name of the address (text).</summary>
        private static MethodInfo FindHostMethod(Type type, string name)
        {
            MethodInfo found = null;
            foreach (var method in type.GetMethods(BindingFlags.Public | BindingFlags.Instance))
            {
                if (method.Name != name)
                {
                    continue;
                }

                var parameters = method.GetParameters();
                if (parameters.Length == 0 || parameters[0].ParameterType != typeof(string))
                {
                    continue;
                }

                // The one with the folder as its second parameter is preferred.
                if (found == null || (parameters.Length > 1 && parameters[1].ParameterType == typeof(string)))
                {
                    found = method;
                }
            }

            return found;
        }

        /// <summary>
        /// Arguments for such a method: the name, then the folder when a second text is asked for, then the
        /// standard value of every other parameter (or the empty value of its type).
        /// </summary>
        private static object[] HostArguments(MethodInfo method, string host, string folder)
        {
            var parameters = method.GetParameters();
            var arguments = new object[parameters.Length];
            for (var i = 0; i < parameters.Length; i++)
            {
                var parameter = parameters[i];
                if (i == 0)
                {
                    arguments[i] = host;
                }
                else if (i == 1 && parameter.ParameterType == typeof(string))
                {
                    arguments[i] = folder;
                }
                else if (parameter.HasDefaultValue)
                {
                    arguments[i] = parameter.DefaultValue;
                }
                else
                {
                    arguments[i] = parameter.ParameterType.IsValueType ? Activator.CreateInstance(parameter.ParameterType) : null;
                }
            }

            return arguments;
        }

        public void OnDispose()
        {
            Log.Info("OnDispose");
            UnregisterImagesHost();

            if (Settings != null)
            {
                Settings.UnregisterInOptionsUI();
                Settings = null;
            }

            Log.Close();
        }
    }
}
