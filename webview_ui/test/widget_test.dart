import 'package:flutter_test/flutter_test.dart';
import 'package:legacy_gantt_chart/legacy_gantt_chart.dart';
import 'package:legacy_timeline_scrubber/legacy_timeline_scrubber.dart';
import 'package:webview_ui/main.dart';

void main() {
  testWidgets('offline app opens with chart and timeline', (tester) async {
    await tester.pumpWidget(const LegacyGanttChartApp());
    await tester.pumpAndSettle();

    expect(find.byType(LegacyGanttChartWidget), findsOneWidget);
    expect(find.byType(LegacyGanttTimelineScrubber), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
