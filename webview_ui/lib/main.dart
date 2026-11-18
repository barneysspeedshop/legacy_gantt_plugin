import 'package:material_ui/material_ui.dart';
import 'package:legacy_gantt_chart/legacy_gantt_chart.dart';
import 'package:legacy_timeline_scrubber/legacy_timeline_scrubber.dart'
    as scrubber;
import 'js_interop_stub.dart' if (dart.library.js_interop) 'js_interop.dart';

void main() {
  runApp(const LegacyGanttChartApp());
}

class LegacyGanttChartApp extends StatelessWidget {
  const LegacyGanttChartApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: Colors.blue,
        brightness: Brightness.light,
      ),
      darkTheme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: Colors.blue,
        brightness: Brightness.dark,
      ),
      themeMode: ThemeMode.system, // Respect system theme
      home: const LegacyGanttChartScreen(),
    );
  }
}

class LegacyGanttChartScreen extends StatefulWidget {
  const LegacyGanttChartScreen({super.key});

  @override
  State<LegacyGanttChartScreen> createState() => _LegacyGanttChartScreenState();
}

class _LegacyGanttChartScreenState extends State<LegacyGanttChartScreen> {
  late final LegacyGanttController _controller;

  @override
  void initState() {
    super.initState();

    // Initialize with mock data for now
    final now = DateTime.now();
    final start = now.subtract(const Duration(days: 2));
    final end = now.add(const Duration(days: 14));

    _controller = LegacyGanttController(
      initialVisibleStartDate: start,
      initialVisibleEndDate: end,
      initialTasks: [
        LegacyGanttTask(
          id: '1',
          rowId: 'r1',
          resourceId: 'r1', // Explicitly set resourceId for grouping
          name: 'Project Alpha',
          start: now,
          end: now.add(const Duration(days: 5)),
          isSummary: true,
        ),
        LegacyGanttTask(
          id: '2',
          rowId: 'r2',
          resourceId: 'r2',
          name: 'Task A',
          start: now,
          end: now.add(const Duration(days: 2)),
          completion: 0.5,
        ),
        LegacyGanttTask(
          id: '3',
          rowId: 'r3',
          resourceId: 'r3',
          name: 'Task B',
          start: now.add(const Duration(days: 2)),
          end: now.add(const Duration(days: 4)),
        ),
        LegacyGanttTask(
          id: '4',
          rowId: 'r4',
          resourceId: 'r4',
          name: 'Milestone 1',
          start: now.add(const Duration(days: 5)),
          end: now.add(const Duration(days: 5)),
          isMilestone: true,
        ),
      ],
      initialDependencies: [],
    );

    // Initial setup
    sendTaskToHost("App Initialized", "INFO");
  }

  void _onScrubberWindowChanged(
    DateTime start,
    DateTime end,
    scrubber.ScrubberHandle handle,
  ) {
    _controller.setVisibleRange(start, end);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          // Ensure we have valid row IDs for display
          final visibleRowIds = _controller.resourceBuckets.keys.toList();
          final visibleGanttRows = visibleRowIds
              .map((id) => LegacyGanttRow(id: id, label: id))
              .toList();
          final rowMaxStackDepth = _controller.resourceBuckets.map(
            (k, v) => MapEntry(k, v.length),
          );

          return Column(
            children: [
              Expanded(
                child: LegacyGanttChartWidget(
                  controller: _controller,
                  visibleRows: visibleGanttRows,
                  rowMaxStackDepth: rowMaxStackDepth,
                  // Explicitly group by rowId/resourceId to ensure tasks map to rows correctly
                  taskGrouper: (task) => task.resourceId ?? task.rowId,
                  onTaskUpdate: (task, start, end) {
                    // Debug output for task updates - using print for web console
                    // ignore: avoid_print
                    print('Task Updated: ${task.name} to $start - $end');
                    sendTaskToHost('Update ${task.id}', 'UPDATE');
                  },
                ),
              ),
              const Divider(height: 1),
              // Timeline Scrubber
              SizedBox(
                height: 60,
                child: Builder(
                  builder: (context) {
                    // Map tasks for the scrubber
                    final scrubberTasks = _controller.tasks
                        .map(
                          (t) => scrubber.LegacyGanttTask(
                            id: t.id,
                            rowId: t.rowId,
                            name: t.name,
                            start: t.start,
                            end: t.end,
                            isSummary: t.isSummary,
                            color: t.color,
                          ),
                        )
                        .toList();

                    // Calculate total range based on tasks if not set explicitly, or just use a buffer window
                    var totalStart = _controller.visibleStartDate.subtract(
                      const Duration(days: 30),
                    );
                    var totalEnd = _controller.visibleEndDate.add(
                      const Duration(days: 30),
                    );

                    if (_controller.tasks.isNotEmpty) {
                      final taskStart = _controller.tasks
                          .map((t) => t.start)
                          .reduce((a, b) => a.isBefore(b) ? a : b);
                      final taskEnd = _controller.tasks
                          .map((t) => t.end)
                          .reduce((a, b) => a.isAfter(b) ? a : b);
                      // Add buffer
                      if (taskStart.isBefore(totalStart)) {
                        totalStart = taskStart.subtract(
                          const Duration(days: 7),
                        );
                      }
                      if (taskEnd.isAfter(totalEnd)) {
                        totalEnd = taskEnd.add(const Duration(days: 7));
                      }
                    }

                    // Ensure total range covers visible range
                    if (_controller.visibleStartDate.isBefore(totalStart)) {
                      totalStart = _controller.visibleStartDate;
                    }
                    if (_controller.visibleEndDate.isAfter(totalEnd)) {
                      totalEnd = _controller.visibleEndDate;
                    }

                    return scrubber.LegacyGanttTimelineScrubber(
                      totalStartDate: totalStart,
                      totalEndDate: totalEnd,
                      visibleStartDate: _controller.visibleStartDate,
                      visibleEndDate: _controller.visibleEndDate,
                      tasks: scrubberTasks,
                      visibleRows: visibleRowIds,
                      rowMaxStackDepth: rowMaxStackDepth,
                      onWindowChanged: _onScrubberWindowChanged,
                    );
                  },
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
