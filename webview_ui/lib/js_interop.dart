void sendTaskToHost(String type, String payload) {
  // Simple console log is sufficient as we have console forwarding in the host
  // Using print for web console output - this is intentional for webview communication
  // ignore: avoid_print
  print('Sending to host: $type $payload');
}
