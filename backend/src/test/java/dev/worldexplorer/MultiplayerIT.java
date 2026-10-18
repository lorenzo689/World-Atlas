package dev.worldexplorer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import dev.worldexplorer.support.IntegrationTest;
import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.MessageHeaders;
import org.springframework.messaging.converter.ByteArrayMessageConverter;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;
import tools.jackson.databind.JsonNode;

/** Two players over real WebSocket/STOMP connections play a full game. */
class MultiplayerIT extends IntegrationTest {

    @Test
    void twoPlayersPlayAGameOverWebSocket() throws Exception {
        String host = newUser();
        String friend = guest("Friend");

        var created = post("/api/rooms", host, Map.of("rounds", 3, "roundSeconds", 8, "types", List.of("CAPITAL", "FLAG")));
        assertThat(created.getStatusCode()).as("create room: %s", created.getBody()).isEqualTo(HttpStatus.CREATED);
        String code = created.getBody().get("code").asString();
        String outsider = guest("Outsider");
        assertThat(get("/api/rooms/" + code, outsider).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(get("/api/rooms/" + code + "/rounds/0/flag", outsider).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(post("/api/rooms/" + code + "/join", friend, null).getStatusCode()).isEqualTo(HttpStatus.OK);

        Player a = connect(host, code);
        Player b = connect(friend, code);

        assertThat(post("/api/rooms/" + code + "/start", friend, null).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(post("/api/rooms/" + code + "/start", host, null).getStatusCode()).isEqualTo(HttpStatus.OK);

        // both answer every round with the first option as soon as it starts
        a.answerEveryRound(code);
        b.answerEveryRound(code);

        await().atMost(Duration.ofSeconds(60)).untilAsserted(() -> {
            assertThat(a.types()).contains("GAME_FINISHED");
            assertThat(b.types()).contains("GAME_FINISHED");
        });
        assertThat(a.types()).containsSubsequence("GAME_STARTING", "ROUND_STARTED", "ROUND_ENDED", "GAME_FINISHED");
        assertThat(a.types().stream().filter("ROUND_ENDED"::equals).count()).isEqualTo(3);

        JsonNode finished = a.last("GAME_FINISHED");
        assertThat(finished.get("data").get("placements")).hasSize(2);

        assertThat(get("/api/rooms/" + code, host).getBody().get("status").asString()).isEqualTo("FINISHED");
        a.session.disconnect();
        b.session.disconnect();
    }

    @Test
    void connectWithoutValidTokenFails() {
        var client = new WebSocketStompClient(new StandardWebSocketClient());
        StompHeaders connect = new StompHeaders();
        connect.add("Authorization", "Bearer invalid");
        var future = client.connectAsync("ws://localhost:" + port + "/ws", new WebSocketHttpHeaders(), connect,
                new StompSessionHandlerAdapter() {});
        // the server answers CONNECT with an ERROR frame and closes the connection
        await().atMost(Duration.ofSeconds(10)).until(() -> future.isDone()
                && (future.isCompletedExceptionally() || !future.join().isConnected()));
    }

    // ---- tiny STOMP test client ------------------------------------------------------------------
    private Player connect(String token, String code) throws Exception {
        var client = new WebSocketStompClient(new StandardWebSocketClient());
        // raw bytes in both directions, whatever the content type (the server sends application/json)
        client.setMessageConverter(new ByteArrayMessageConverter() {
            @Override
            protected boolean supportsMimeType(MessageHeaders headers) {
                return true;
            }
        });
        StompHeaders connect = new StompHeaders();
        connect.add("Authorization", "Bearer " + token);
        StompSession session = client.connectAsync("ws://localhost:" + port + "/ws", new WebSocketHttpHeaders(), connect,
                new StompSessionHandlerAdapter() {}).get(10, TimeUnit.SECONDS);
        Player p = new Player(session);
        session.subscribe("/topic/rooms/" + code, p);
        Thread.sleep(300); // let the subscription register before events start flowing
        return p;
    }

    private class Player implements StompFrameHandler {
        final StompSession session;
        final List<JsonNode> events = new CopyOnWriteArrayList<>();
        volatile String answeringRoom;

        Player(StompSession session) {
            this.session = session;
        }

        void answerEveryRound(String code) {
            answeringRoom = code;
        }

        List<String> types() {
            return events.stream().map(e -> e.get("type").asString()).toList();
        }

        JsonNode last(String type) {
            return events.reversed().stream().filter(e -> e.get("type").asString().equals(type)).findFirst().orElseThrow();
        }

        @Override
        public Type getPayloadType(StompHeaders headers) {
            return byte[].class;
        }

        @Override
        public void handleFrame(StompHeaders headers, Object payload) {
            JsonNode event = json.readTree(new String((byte[]) payload, StandardCharsets.UTF_8));
            events.add(event);
            if ("ROUND_STARTED".equals(event.get("type").asString()) && answeringRoom != null) {
                JsonNode data = event.get("data");
                String answer = data.get("question").get("options").get(0).get("id").asString();
                byte[] body = json.writeValueAsBytes(Map.of("round", data.get("round").asInt(), "answer", answer));
                StompHeaders send = new StompHeaders();
                send.setDestination("/app/rooms/" + answeringRoom + "/answer");
                send.setContentType(org.springframework.util.MimeTypeUtils.APPLICATION_JSON);
                session.send(send, body);
            }
        }
    }
}
