using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading.Tasks;
using Colossal.UI.Binding;
using Game.UI;
using ToolbarOrganizer.Data;
using ToolbarOrganizer.Diagnostics;
using PsiMod = Colossal.PSI.Common.Mod;

namespace ToolbarOrganizer.Systems
{
    /// <summary>
    /// Bridge between the C# part and the UI module. Binding group: "ToolbarOrganizer".
    ///
    /// Values read by the UI:
    ///   enabled    (bool)   master switch from the options page
    ///   layout     (string) saved layout as JSON, empty when there is none
    ///   modIndex   (string) mods that use the top toolbars, with official name and image files, as JSON
    ///   probeIndex (string) probe id -> UI module names, as JSON
    ///   imagesHost (string) name of the mod's own address for its images; empty when none was registered
    ///
    /// Commands sent by the UI:
    ///   saveLayout(string json)          stores the layout and publishes it back
    ///   resetAll()                       erases the layout (full reset)
    ///   requestModIndex()                builds the mod index, once per game session
    ///   resolveProbe(string id, string)  component source code to be found inside the UI modules
    ///   log(string)                      writes a line to the complete log
    /// </summary>
    public partial class ToolbarOrganizerUISystem : UISystemBase
    {
        private const string kGroup = Mod.kId;
        private const int kMaxProbes = 600;
        private const int kMaxProbeLength = 4000;
        private const int kMinProbeLength = 12;
        private const int kMaxLogLength = 8000;
        private const long kNamesTimeoutMs = 15000;

        private ValueBinding<string> m_Layout;
        private ValueBinding<string> m_ModIndex;
        private ValueBinding<string> m_ProbeIndex;

        private List<ModIndex.ModuleEntry> m_Modules;
        private Task<HashSet<PsiMod>> m_NamesTask;
        private Stopwatch m_NamesWatch;
        private bool m_BuildStarted;
        private Task<ModIndex.IndexResult> m_IndexTask;
        private bool m_IndexReady;

        private readonly List<ModIndex.Probe> m_PendingProbes = new List<ModIndex.Probe>();
        private readonly HashSet<string> m_KnownProbeIds = new HashSet<string>();
        private readonly Dictionary<string, List<string>> m_ProbeHits = new Dictionary<string, List<string>>();
        private Task<ModIndex.ProbeResult> m_ProbeTask;

        private bool m_ResetPending;
        private bool m_LastEnabled;
        private bool m_UpdateFailed;

        protected override void OnCreate()
        {
            base.OnCreate();

            m_LastEnabled = IsEnabled();

            AddUpdateBinding(new GetterValueBinding<bool>(kGroup, "enabled", IsEnabled));
            AddBinding(m_Layout = new ValueBinding<string>(kGroup, "layout", LayoutStore.Load()));
            AddBinding(m_ModIndex = new ValueBinding<string>(kGroup, "modIndex", string.Empty));
            AddBinding(m_ProbeIndex = new ValueBinding<string>(kGroup, "probeIndex", string.Empty));
            AddBinding(new ValueBinding<string>(kGroup, "imagesHost", Mod.ImagesHost ?? string.Empty));

            AddBinding(new TriggerBinding<string>(kGroup, "saveLayout", OnSaveLayout));
            AddBinding(new TriggerBinding(kGroup, "resetAll", OnResetAll));
            AddBinding(new TriggerBinding(kGroup, "requestModIndex", OnRequestModIndex));
            AddBinding(new TriggerBinding<string, string>(kGroup, "resolveProbe", OnResolveProbe));
            AddBinding(new TriggerBinding<string>(kGroup, "log", OnLog));

            LayoutStore.onReset += OnLayoutReset;
            Log.Info("UI system created: bindings registered, Enabled=" + m_LastEnabled);
        }

        protected override void OnDestroy()
        {
            LayoutStore.onReset -= OnLayoutReset;
            Log.Info("UI system destroyed");
            base.OnDestroy();
        }

        protected override void OnUpdate()
        {
            base.OnUpdate();

            try
            {
                Step();
            }
            catch (Exception e)
            {
                // Logged once: a failure here would otherwise repeat on every frame.
                if (!m_UpdateFailed)
                {
                    m_UpdateFailed = true;
                    Log.Error("UI system update failed.", e);
                }
            }
        }

        private void Step()
        {
            var enabled = IsEnabled();
            if (enabled != m_LastEnabled)
            {
                m_LastEnabled = enabled;
                Log.Info("Setting changed: Enabled=" + enabled);
            }

            if (m_ResetPending)
            {
                m_ResetPending = false;
                m_Layout.Update(string.Empty);
            }

            // 1. Official names, then the index (off the main thread).
            if (m_Modules != null && !m_BuildStarted)
            {
                var namesDone = m_NamesTask == null || m_NamesTask.IsCompleted;
                var timedOut = m_NamesWatch != null && m_NamesWatch.ElapsedMilliseconds > kNamesTimeoutMs;
                if (namesDone || timedOut)
                {
                    var names = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    if (m_NamesTask == null)
                    {
                        Log.Warn("Official names: not available; module names are used");
                    }
                    else if (!namesDone)
                    {
                        Log.Warn("Official names: no answer after " + kNamesTimeoutMs + " ms; module names are used");
                    }
                    else if (m_NamesTask.IsFaulted || m_NamesTask.IsCanceled)
                    {
                        Log.Error("Official names: the service failed; module names are used.", m_NamesTask.Exception);
                    }
                    else
                    {
                        names = ModIndex.ReadOfficialNames(m_NamesTask.Result);
                        Log.Info("Official names: " + names.Count + " mods in the active playset, answered in " +
                                 (m_NamesWatch != null ? m_NamesWatch.ElapsedMilliseconds : 0) + " ms");
                    }

                    m_BuildStarted = true;
                    var modules = m_Modules;
                    m_IndexTask = Task.Run(() => ModIndex.Build(modules, names));
                }
            }

            if (m_IndexTask != null && m_IndexTask.IsCompleted)
            {
                var task = m_IndexTask;
                m_IndexTask = null;

                if (task.IsFaulted || task.IsCanceled)
                {
                    Log.Error("The mod index could not be built; buttons stay unidentified.", task.Exception);
                    m_ModIndex.Update("{\"mods\":[]}");
                }
                else
                {
                    Log.Info(task.Result.report);
                    m_ModIndex.Update(task.Result.json);
                }

                m_IndexReady = true;
            }

            // 2. Probes: component source code searched inside the UI modules (off the main thread).
            if (m_ProbeTask != null && m_ProbeTask.IsCompleted)
            {
                var task = m_ProbeTask;
                m_ProbeTask = null;

                if (task.IsFaulted || task.IsCanceled)
                {
                    Log.Error("The probe search failed.", task.Exception);
                }
                else
                {
                    Log.Info(task.Result.report);
                    foreach (var pair in task.Result.hits)
                    {
                        m_ProbeHits[pair.Key] = pair.Value;
                    }
                    m_ProbeIndex.Update(ModIndex.HitsToJson(m_ProbeHits));
                }
            }

            if (m_IndexReady && m_ProbeTask == null && m_PendingProbes.Count > 0)
            {
                var modules = m_Modules;
                var probes = new List<ModIndex.Probe>(m_PendingProbes);
                m_PendingProbes.Clear();
                m_ProbeTask = Task.Run(() => ModIndex.ResolveProbes(modules, probes));
            }
        }

        private static bool IsEnabled()
        {
            var settings = Mod.Settings;
            return settings != null && settings.Enabled;
        }

        private void OnSaveLayout(string json)
        {
            try
            {
                Log.Info("Command saveLayout");
                if (LayoutStore.Save(json))
                {
                    m_Layout.Update(json);
                }
            }
            catch (Exception e)
            {
                Log.Error("Command saveLayout failed.", e);
            }
        }

        private void OnResetAll()
        {
            try
            {
                Log.Info("Command resetAll (mod menu)");
                LayoutStore.Reset();
            }
            catch (Exception e)
            {
                Log.Error("Command resetAll failed.", e);
            }
        }

        private void OnLayoutReset()
        {
            // Applied in the update so the binding is always changed from the UI update.
            m_ResetPending = true;
        }

        private void OnRequestModIndex()
        {
            if (m_Modules != null)
            {
                Log.Info("Command requestModIndex: index already " + (m_IndexReady ? "built" : "in progress"));
                return;
            }

            try
            {
                Log.Info("Command requestModIndex");
                m_Modules = ModIndex.CollectModules();
                m_NamesTask = ModIndex.RequestOfficialNames();
                m_NamesWatch = Stopwatch.StartNew();
            }
            catch (Exception e)
            {
                Log.Error("The UI modules could not be listed; buttons stay unidentified.", e);
                m_Modules = new List<ModIndex.ModuleEntry>();
                m_BuildStarted = true;
                m_ModIndex.Update("{\"mods\":[]}");
                m_IndexReady = true;
            }
        }

        private void OnResolveProbe(string id, string text)
        {
            if (string.IsNullOrEmpty(id) || string.IsNullOrEmpty(text))
            {
                return;
            }

            if (text.Length < kMinProbeLength || text.Length > kMaxProbeLength)
            {
                Log.Trace("Probe " + id + " refused: length " + text.Length);
                return;
            }

            if (m_KnownProbeIds.Count >= kMaxProbes || !m_KnownProbeIds.Add(id))
            {
                return;
            }

            m_PendingProbes.Add(new ModIndex.Probe { id = id, text = text });
        }

        private void OnLog(string message)
        {
            if (string.IsNullOrEmpty(message))
            {
                return;
            }

            if (message.Length > kMaxLogLength)
            {
                message = message.Substring(0, kMaxLogLength) + " ...(cut)";
            }

            Log.Ui(message);
        }
    }
}
