package com.vampiresurvivor.server;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;

import java.io.*;
import java.net.*;
import java.awt.Desktop;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import com.sun.net.httpserver.HttpServer;

public class GameServer {
    private static final int WS_PORT = 8080;
    private static final int HTTP_PORT = 8081;
    private static int GAME_PORT = 5173;
    
    private static String tailscaleIP = null;
    private static final Map<String, ClientInfo> clients = new ConcurrentHashMap<>();
    private static final GameState gameState = new GameState();
    private static int nextPlayerId = 1;
    private static String hostId = null;
    private static long lastRequestTime = System.currentTimeMillis();
    
    private static WebSocketServer wss;
    private static HttpServer httpServer;
    private static HttpServer gameServer;
    private static final Gson gson = new Gson();
    private static final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2);
    
    public static void main(String[] args) {
        System.out.println("Starting Mini Survivors server...\n");
        
        // Tailscale IP 감지
        detectTailscaleIP();
        
        // WebSocket 서버 시작
        startWebSocketServer();
        
        // HTTP 서버 시작 (IP 정보 제공)
        startHttpServer();
        
        // 게임 파일 제공용 HTTP 서버 시작
        startGameServer();
        
        // 브라우저 모니터링 시작
        startBrowserMonitoring();
        
        // 서버 상태 주기적 출력
        scheduler.scheduleAtFixedRate(() -> {
            System.out.println(String.format("📊 서버 상태: %d명 연결 중, 게임 상태: %s",
                clients.size(), gameState.started ? "진행 중" : "대기 중"));
        }, 30, 30, TimeUnit.SECONDS);
        
        // Tailscale IP 주기적 재확인
        scheduler.scheduleAtFixedRate(() -> {
            detectTailscaleIP();
        }, 5, 5, TimeUnit.SECONDS);
    }
    
    private static void startWebSocketServer() {
        wss = new WebSocketServer(new InetSocketAddress("0.0.0.0", WS_PORT)) {
            @Override
            public void onOpen(WebSocket conn, ClientHandshake handshake) {
                String clientId = System.currentTimeMillis() + "-" + UUID.randomUUID().toString().substring(0, 9);
                String clientIP = conn.getRemoteSocketAddress().getAddress().getHostAddress();
                
                // 마스터 결정: 첫 번째 클라이언트가 항상 마스터 (localhost든 Tailscale IP든 상관없이)
                boolean isHost = clients.isEmpty();
                
                if (isHost) {
                    hostId = clientId;
                }
                
                String playerId = "P" + nextPlayerId++;
                clients.put(clientId, new ClientInfo(conn, playerId, isHost));
                lastRequestTime = System.currentTimeMillis();
                
                System.out.println("\n✅ 클라이언트 연결 성공!");
                System.out.println("   클라이언트 ID: " + clientId);
                System.out.println("   플레이어 ID: " + playerId + (isHost ? " [HOST/MASTER]" : " [GUEST]"));
                System.out.println("   연결 주소: " + clientIP);
                System.out.println("   현재 연결된 클라이언트 수: " + clients.size());
                
                // 초기 상태 전송
                JsonObject response = new JsonObject();
                response.addProperty("type", "connected");
                response.addProperty("clientId", clientId);
                response.addProperty("playerId", playerId);
                response.addProperty("isHost", isHost);
                response.add("state", gameState.toJson());
                response.addProperty("tailscaleIP", tailscaleIP);
                response.addProperty("wsUrl", tailscaleIP != null ? "ws://" + tailscaleIP + ":" + WS_PORT : null);
                conn.send(response.toString());
                
                // 플레이어 추가
                if (!gameState.players.containsKey(playerId)) {
                    PlayerData player = new PlayerData();
                    player.id = playerId;
                    player.x = (gameState.players.size()) * 40;
                    player.y = 0;
                    player.hp = 100;
                    player.hpMax = 100;
                    player.level = 1;
                    player.color = isHost ? "rgba(232,238,255,0.92)" : "rgba(124,92,255,0.95)";
                    player.damage = 9;
                    player.fireRate = 3.2f;
                    player.pierce = 0;
                    player.pickup = 70;
                    player.regen = 0;
                    player.projSize = 4;
                    player.projCount = 1;
                    player.dashCd = 0;
                    player.dashCdMax = 1.1f;
                    
                    gameState.players.put(playerId, player);
                    
                    // 게스트가 들어오면 게임 시작
                    if (!isHost && gameState.players.size() > 1) {
                        if (!gameState.started) {
                            gameState.started = true;
                            gameState.t = 0;
                            gameState.paused = false;
                            gameState.gameOver = false;
                            System.out.println("🎮 게스트가 들어와서 게임 시작 (총 " + gameState.players.size() + "명)");
                        }
                    } else if (isHost && gameState.players.size() > 1 && !gameState.started) {
                        gameState.started = true;
                        gameState.t = 0;
                        gameState.paused = false;
                        gameState.gameOver = false;
                        System.out.println("🎮 게스트가 들어와서 게임 시작 (총 " + gameState.players.size() + "명)");
                    }
                    
                    broadcastState(null);
                }
                
                // Keepalive
                scheduler.scheduleAtFixedRate(() -> {
                    if (conn.isOpen()) {
                        conn.sendPing();
                    }
                }, 30, 30, TimeUnit.SECONDS);
            }
            
            @Override
            public void onClose(WebSocket conn, int code, String reason, boolean remote) {
                String clientId = findClientId(conn);
                if (clientId != null) {
                    ClientInfo client = clients.get(clientId);
                    if (client != null) {
                        System.out.println("\n❌ 클라이언트 연결 종료: " + clientId + " (" + client.playerId + ")");
                        System.out.println("   종료 코드: " + code + ", 이유: " + (reason != null ? reason : "없음"));
                        
                        gameState.players.remove(client.playerId);
                        
                        if (clientId.equals(hostId)) {
                            System.out.println("⚠️  호스트가 연결을 끊었습니다.");
                            Optional<Map.Entry<String, ClientInfo>> remaining = clients.entrySet().stream()
                                .filter(e -> !e.getKey().equals(clientId))
                                .findFirst();
                            if (remaining.isPresent()) {
                                hostId = remaining.get().getKey();
                                remaining.get().getValue().isHost = true;
                                System.out.println("   새 호스트: " + hostId + " (" + remaining.get().getValue().playerId + ")");
                                
                                JsonObject msg = new JsonObject();
                                msg.addProperty("type", "hostChanged");
                                msg.addProperty("newHostId", hostId);
                                GameServer.broadcast(msg.toString(), null);
                            } else {
                                System.out.println("   모든 클라이언트가 연결을 끊었습니다.");
                                gameState.started = false;
                            }
                        }
                        
                        clients.remove(clientId);
                        System.out.println("   남은 클라이언트 수: " + clients.size());
                        broadcastState(null);
                    }
                }
            }
            
            @Override
            public void onMessage(WebSocket conn, String message) {
                lastRequestTime = System.currentTimeMillis();
                
                try {
                    JsonObject data = gson.fromJson(message, JsonObject.class);
                    String type = data.get("type").getAsString();
                    String clientId = findClientId(conn);
                    ClientInfo client = clientId != null ? clients.get(clientId) : null;
                    
                    if (client == null) return;
                    
                    switch (type) {
                        case "playerUpdate":
                            // 모든 플레이어가 자신의 플레이어 데이터를 업데이트할 수 있음
                            String updatePlayerId = data.get("playerId").getAsString();
                            if (gameState.players.containsKey(updatePlayerId)) {
                                // 자신의 플레이어만 업데이트 가능 (보안)
                                if (updatePlayerId.equals(client.playerId)) {
                                    PlayerData player = gameState.players.get(updatePlayerId);
                                    JsonObject playerData = data.getAsJsonObject("player");
                                    updatePlayerData(player, playerData);
                                    broadcastState(null);
                                }
                            }
                            break;
                            
                        case "startGame":
                            // 호스트가 게임을 시작할 수 있음 (1명 이상, 솔로 플레이 포함)
                            if (client.isHost && gameState.players.size() >= 1) {
                                gameState.started = true;
                                gameState.t = 0;
                                gameState.paused = false;
                                gameState.gameOver = false;
                                System.out.println("🎮 호스트가 게임 시작 (총 " + gameState.players.size() + "명)");
                                broadcastState(null);
                            }
                            break;
                            
                        case "reset":
                            if (client.isHost) {
                                gameState.t = 0;
                                gameState.paused = false;
                                gameState.gameOver = false;
                                gameState.enemies.clear();
                                gameState.projectiles.clear();
                                gameState.orbs.clear();
                                int idx = 0;
                                for (PlayerData p : gameState.players.values()) {
                                    p.x = idx * 40;
                                    p.y = 0;
                                    p.vx = 0;
                                    p.vy = 0;
                                    p.hp = 100;
                                    p.hpMax = 100;
                                    idx++;
                                }
                                broadcastState(null);
                            }
                            break;
                            
                        case "levelUp":
                            // 모든 플레이어가 자신의 레벨을 업데이트할 수 있음
                            String levelUpPlayerId = data.get("playerId").getAsString();
                            if (gameState.players.containsKey(levelUpPlayerId)) {
                                if (levelUpPlayerId.equals(client.playerId)) {
                                    PlayerData p = gameState.players.get(levelUpPlayerId);
                                    p.level = data.get("level").getAsInt();
                                    broadcastState(null);
                                }
                            }
                            break;
                            
                        case "projectile":
                            // 모든 플레이어가 자신의 투사체를 브로드캐스트할 수 있음
                            if (data.has("playerId") && data.has("projectile")) {
                                String projPlayerId = data.get("playerId").getAsString();
                                // 자신의 투사체만 브로드캐스트 가능
                                if (projPlayerId.equals(client.playerId)) {
                                    JsonObject msg = new JsonObject();
                                    msg.addProperty("type", "projectile");
                                    msg.add("playerId", data.get("playerId"));
                                    msg.add("projectile", data.get("projectile"));
                                    GameServer.broadcast(msg.toString(), clientId);
                                }
                            }
                            break;
                    }
                } catch (Exception e) {
                    System.err.println("메시지 파싱 오류: " + e.getMessage());
                    e.printStackTrace();
                }
            }
            
            @Override
            public void onError(WebSocket conn, Exception ex) {
                String clientId = findClientId(conn);
                System.err.println("\n❌ 클라이언트 오류 발생");
                if (clientId != null) {
                    System.err.println("   클라이언트 ID: " + clientId);
                }
                System.err.println("   오류 메시지: " + ex.getMessage());
                ex.printStackTrace();
            }
            
            @Override
            public void onStart() {
                System.out.println("\n✅ WebSocket 서버가 포트 " + WS_PORT + "에서 리스닝 중입니다.");
                System.out.println("   바인딩 주소: 0.0.0.0 (모든 네트워크 인터페이스)");
                System.out.println("   로컬 주소: ws://localhost:" + WS_PORT);
                if (tailscaleIP != null) {
                    System.out.println("   Tailscale 주소: ws://" + tailscaleIP + ":" + WS_PORT);
                    System.out.println("\n💡 다른 플레이어는 이 주소로 연결하세요:");
                    System.out.println("   " + tailscaleIP);
                    System.out.println("   또는: ws://" + tailscaleIP + ":" + WS_PORT);
                } else {
                    System.out.println("   ⚠️  Tailscale IP: 확인 필요 (tailscale ip 명령 실행)");
                }
                System.out.println("\n📡 서버가 모든 인터페이스에서 연결을 기다리는 중...\n");
            }
        };
        
        wss.start();
    }
    
    private static void startHttpServer() {
        try {
            httpServer = HttpServer.create(new InetSocketAddress("0.0.0.0", HTTP_PORT), 0);
            
            // IP 정보 제공 핸들러
            com.sun.net.httpserver.HttpHandler ipHandler = exchange -> {
                exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                
                JsonObject response = new JsonObject();
                response.addProperty("success", true);
                response.addProperty("tailscaleIP", tailscaleIP);
                response.addProperty("port", WS_PORT);
                response.addProperty("wsUrl", tailscaleIP != null ? "ws://" + tailscaleIP + ":" + WS_PORT : null);
                response.addProperty("localUrl", "ws://localhost:" + WS_PORT);
                response.addProperty("timestamp", System.currentTimeMillis());
                
                String json = gson.toJson(response);
                exchange.sendResponseHeaders(200, json.getBytes().length);
                exchange.getResponseBody().write(json.getBytes());
                exchange.close();
            };
            
            httpServer.createContext("/ip", ipHandler);
            httpServer.createContext("/api/ip", ipHandler);
            
            httpServer.setExecutor(null);
            httpServer.start();
            System.out.println("📡 HTTP 서버 시작: http://localhost:" + HTTP_PORT + "/ip (IP 정보 제공)");
        } catch (IOException e) {
            System.err.println("HTTP 서버 시작 실패: " + e.getMessage());
            e.printStackTrace();
        }
    }
    
    private static void startGameServer() {
        startGameServer(GAME_PORT);
    }
    
    private static void startGameServer(int port) {
        try {
            gameServer = HttpServer.create(new InetSocketAddress("0.0.0.0", port), 0);
            gameServer.createContext("/", exchange -> {
                lastRequestTime = System.currentTimeMillis();
                
                String path = exchange.getRequestURI().getPath();
                if (path.equals("/")) {
                    path = "/index.html";
                }
                
                // 현재 작업 디렉토리 기준으로 파일 경로 설정
                String currentDir = System.getProperty("user.dir");
                // path가 "/index.html" 형태이므로 첫 번째 '/'를 제거
                String relativePath = path.startsWith("/") ? path.substring(1) : path;
                Path filePath = Paths.get(currentDir, relativePath);
                
                // 디버깅 정보 출력
                System.out.println("📄 파일 요청: " + path + " -> " + filePath.toAbsolutePath());
                
                String contentType = getContentType(filePath.toString());
                
                try {
                    if (Files.exists(filePath) && Files.isRegularFile(filePath)) {
                        byte[] content = Files.readAllBytes(filePath);
                        exchange.getResponseHeaders().set("Content-Type", contentType);
                        exchange.sendResponseHeaders(200, content.length);
                        exchange.getResponseBody().write(content);
                    } else {
                        // 404 오류 시 상세 정보 출력
                        System.err.println("❌ 파일을 찾을 수 없습니다: " + filePath.toAbsolutePath());
                        System.err.println("   현재 디렉토리: " + currentDir);
                        String error = "<h1>404 - 파일을 찾을 수 없습니다</h1><p>요청한 경로: " + path + "</p><p>실제 경로: " + filePath.toAbsolutePath() + "</p>";
                        exchange.getResponseHeaders().set("Content-Type", "text/html");
                        exchange.sendResponseHeaders(404, error.getBytes().length);
                        exchange.getResponseBody().write(error.getBytes());
                    }
                } catch (IOException e) {
                    System.err.println("❌ 파일 읽기 오류: " + e.getMessage());
                    String error = "서버 오류: " + e.getMessage();
                    exchange.sendResponseHeaders(500, error.getBytes().length);
                    exchange.getResponseBody().write(error.getBytes());
                } finally {
                    exchange.close();
                }
            });
            
            gameServer.setExecutor(null);
            gameServer.start();
            GAME_PORT = port;
            
            // 실제 바인딩 주소 확인
            InetSocketAddress bindAddress = gameServer.getAddress();
            System.out.println("🎮 게임 서버 시작:");
            System.out.println("   바인딩 주소: " + bindAddress.getHostString() + ":" + bindAddress.getPort());
            System.out.println("   로컬 주소: http://localhost:" + GAME_PORT);
            
            // 모든 네트워크 인터페이스 정보 출력
            try {
                Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
                boolean hasTailscale = false;
                while (interfaces.hasMoreElements()) {
                    NetworkInterface iface = interfaces.nextElement();
                    if (iface.isUp() && !iface.isLoopback()) {
                        Enumeration<InetAddress> addresses = iface.getInetAddresses();
                        while (addresses.hasMoreElements()) {
                            InetAddress addr = addresses.nextElement();
                            if (addr instanceof Inet4Address) {
                                String ip = addr.getHostAddress();
                                boolean isTailscale = ip.startsWith("100.");
                                if (isTailscale) hasTailscale = true;
                                System.out.println("   네트워크 인터페이스: " + iface.getName() + " -> " + ip + (isTailscale ? " (Tailscale)" : ""));
                                System.out.println("     접속 주소: http://" + ip + ":" + GAME_PORT);
                            }
                        }
                    }
                }
                if (!hasTailscale && tailscaleIP == null) {
                    System.out.println("   ⚠️  Tailscale 인터페이스를 찾을 수 없습니다.");
                }
            } catch (Exception e) {
                System.err.println("   ⚠️  네트워크 인터페이스 정보를 가져올 수 없습니다: " + e.getMessage());
            }
            
            if (tailscaleIP != null) {
                System.out.println("\n💡 다른 플레이어는 이 주소로 접속하세요:");
                System.out.println("   http://" + tailscaleIP + ":" + GAME_PORT);
            }
            
            // 브라우저 자동 열기는 start.bat에서 처리하므로 여기서는 안내만
            // (중복 실행 방지)
            
        } catch (IOException e) {
            if (e.getMessage().contains("Address already in use")) {
                if (port < 5200) {
                    System.out.println("⚠️  포트 " + port + "가 사용 중입니다. 포트 " + (port + 1) + "을 시도합니다...");
                    startGameServer(port + 1);
                } else {
                    System.err.println("❌ 사용 가능한 포트를 찾을 수 없습니다 (5173-5200).");
                    System.exit(1);
                }
            } else {
                System.err.println("❌ 게임 서버 오류: " + e.getMessage());
                e.printStackTrace();
                System.exit(1);
            }
        }
    }
    
    private static void openBrowser(String url) {
        try {
            String os = System.getProperty("os.name").toLowerCase();
            
            // Java Desktop API 사용 시도 (가장 안정적)
            if (Desktop.isDesktopSupported()) {
                Desktop desktop = Desktop.getDesktop();
                if (desktop.isSupported(Desktop.Action.BROWSE)) {
                    try {
                        desktop.browse(new URI(url));
                        System.out.println("✅ 브라우저가 자동으로 열렸습니다: " + url);
                        return;
                    } catch (Exception e) {
                        // Desktop API 실패 시 다른 방법 시도
                        System.out.println("⚠️  Desktop API 실패, 대체 방법 시도 중...");
                    }
                }
            }
            
            // Desktop API가 실패하거나 지원되지 않을 경우 대체 방법 사용
            ProcessBuilder pb;
            if (os.contains("win")) {
                // Windows: 여러 방법 시도
                // 방법 1: start 명령 (가장 일반적)
                try {
                    pb = new ProcessBuilder("cmd", "/c", "start", url);
                    pb.redirectErrorStream(true);
                    pb.start();
                    System.out.println("✅ 브라우저 열기 시도: " + url);
                    return;
                } catch (Exception e1) {
                    // 방법 2: rundll32 사용
                    try {
                        pb = new ProcessBuilder("rundll32", "url.dll,FileProtocolHandler", url);
                        pb.redirectErrorStream(true);
                        pb.start();
                        System.out.println("✅ 브라우저 열기 시도 (rundll32): " + url);
                        return;
                    } catch (Exception e2) {
                        throw new IOException("모든 브라우저 열기 방법 실패", e2);
                    }
                }
            } else if (os.contains("mac")) {
                pb = new ProcessBuilder("open", url);
                pb.start();
                System.out.println("✅ 브라우저 열기 시도: " + url);
            } else {
                pb = new ProcessBuilder("xdg-open", url);
                pb.start();
                System.out.println("✅ 브라우저 열기 시도: " + url);
            }
        } catch (Exception e) {
            System.out.println("⚠️  브라우저를 자동으로 열 수 없습니다.");
            System.out.println("   수동으로 다음 주소를 브라우저에 입력하세요: " + url);
            System.out.println("   오류: " + e.getMessage());
        }
    }
    
    private static void startBrowserMonitoring() {
        final long serverStartTime = System.currentTimeMillis();
        scheduler.scheduleAtFixedRate(() -> {
            long timeSinceLastRequest = System.currentTimeMillis() - lastRequestTime;
            long timeSinceServerStart = System.currentTimeMillis() - serverStartTime;
            int activeClients = clients.size();
            
            // 활성 클라이언트가 있으면 계속 실행 (솔로 플레이 포함)
            // WebSocket 연결이 유지되면 브라우저가 열려있는 것으로 간주
            if (activeClients > 0) {
                // 클라이언트가 있으면 HTTP 요청 타임아웃 체크를 하지 않음
                return;
            }
            
            // 서버 시작 후 최소 2분(120초)는 대기 (브라우저가 열릴 충분한 시간 확보)
            // 브라우저 자동 열기가 실패할 수 있으므로 사용자가 수동으로 열 시간을 충분히 줌
            if (timeSinceServerStart < 120000) {
                return;
            }
            
            // 활성 클라이언트가 없고, 2분 동안 HTTP 요청이 없으면 브라우저가 닫힌 것으로 간주
            // (게임 서버는 주기적으로 리소스를 요청하므로, 요청이 없으면 브라우저가 닫힌 것)
            // 타임아웃을 2분으로 늘려서 사용자가 수동으로 브라우저를 열 시간 충분히 확보
            if (timeSinceLastRequest > 120000) {
                System.out.println("\n⚠️  브라우저가 닫혔거나 연결이 없습니다. 서버를 종료합니다...");
                System.out.println("   브라우저를 열려면: http://localhost:" + GAME_PORT);
                if (tailscaleIP != null) {
                    System.out.println("   또는: http://" + tailscaleIP + ":" + GAME_PORT);
                }
                try {
                    // 스케줄러 종료
                    scheduler.shutdownNow();
                    // 서버 종료
                    if (wss != null) {
                        try {
                            wss.stop(50);
                        } catch (Exception e) {
                            // 무시
                        }
                    }
                    if (httpServer != null) {
                        httpServer.stop(0);
                    }
                    if (gameServer != null) {
                        gameServer.stop(0);
                    }
                } catch (Exception e) {
                    // 무시
                }
                // 즉시 종료 (모든 스레드 강제 종료)
                System.exit(0);
            }
        }, 5000, 5000, TimeUnit.MILLISECONDS); // 5초마다 확인
    }
    
    private static void detectTailscaleIP() {
        try {
            Process process = new ProcessBuilder("tailscale", "ip").start();
            BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
            String ip = reader.readLine();
            if (ip != null && ip.matches("^100\\.\\d+\\.\\d+\\.\\d+$")) {
                if (!ip.equals(tailscaleIP)) {
                    tailscaleIP = ip;
                    System.out.println("✅ Tailscale IP 감지: " + ip);
                }
                return;
            }
        } catch (Exception e) {
            // Tailscale 명령 실패
        }
        
        // 대체 방법: 네트워크 인터페이스에서 찾기
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces.hasMoreElements()) {
                NetworkInterface iface = interfaces.nextElement();
                String name = iface.getName().toLowerCase();
                if (name.contains("tailscale") || name.contains("utun")) {
                    Enumeration<InetAddress> addresses = iface.getInetAddresses();
                    while (addresses.hasMoreElements()) {
                        InetAddress addr = addresses.nextElement();
                        if (addr instanceof Inet4Address && addr.getHostAddress().startsWith("100.")) {
                            String ip = addr.getHostAddress();
                            if (!ip.equals(tailscaleIP)) {
                                tailscaleIP = ip;
                                System.out.println("✅ Tailscale IP 감지 (인터페이스): " + ip);
                            }
                            return;
                        }
                    }
                }
            }
        } catch (Exception e) {
            // 인터페이스 검색 실패
        }
        
        if (tailscaleIP == null) {
            System.out.println("⚠️  Tailscale IP를 자동으로 감지하지 못했습니다.");
            System.out.println("   수동 확인: tailscale ip");
        }
    }
    
    private static void broadcastState(String excludeClientId) {
        JsonObject msg = new JsonObject();
        msg.addProperty("type", "state");
        msg.add("state", gameState.toJson());
        broadcast(msg.toString(), excludeClientId);
    }
    
    private static void broadcast(String message, String excludeClientId) {
        clients.forEach((id, client) -> {
            if (!id.equals(excludeClientId) && client.conn.isOpen()) {
                try {
                    client.conn.send(message);
                } catch (Exception e) {
                    System.err.println("메시지 전송 실패 (" + id + "): " + e.getMessage());
                    try {
                        client.conn.close();
                    } catch (Exception ex) {
                        // 무시
                    }
                }
            }
        });
    }
    
    private static String findClientId(WebSocket conn) {
        return clients.entrySet().stream()
            .filter(e -> e.getValue().conn.equals(conn))
            .map(Map.Entry::getKey)
            .findFirst()
            .orElse(null);
    }
    
    private static void updatePlayerData(PlayerData player, JsonObject data) {
        if (data.has("x")) player.x = data.get("x").getAsFloat();
        if (data.has("y")) player.y = data.get("y").getAsFloat();
        if (data.has("vx")) player.vx = data.get("vx").getAsFloat();
        if (data.has("vy")) player.vy = data.get("vy").getAsFloat();
        if (data.has("hp")) player.hp = data.get("hp").getAsInt();
        if (data.has("hpMax")) player.hpMax = data.get("hpMax").getAsInt();
        if (data.has("level")) player.level = data.get("level").getAsInt();
        if (data.has("damage")) player.damage = data.get("damage").getAsFloat();
        if (data.has("fireRate")) player.fireRate = data.get("fireRate").getAsFloat();
        if (data.has("pierce")) player.pierce = data.get("pierce").getAsInt();
        if (data.has("pickup")) player.pickup = data.get("pickup").getAsFloat();
        if (data.has("dashCd")) player.dashCd = data.get("dashCd").getAsFloat();
        if (data.has("dashCdMax")) player.dashCdMax = data.get("dashCdMax").getAsFloat();
        if (data.has("projSize")) player.projSize = data.get("projSize").getAsFloat();
        if (data.has("projCount")) player.projCount = data.get("projCount").getAsInt();
    }
    
    private static String getContentType(String filename) {
        String ext = filename.substring(filename.lastIndexOf('.'));
        switch (ext.toLowerCase()) {
            case ".html": return "text/html";
            case ".js": return "text/javascript";
            case ".css": return "text/css";
            case ".json": return "application/json";
            case ".png": return "image/png";
            case ".jpg": case ".jpeg": return "image/jpeg";
            case ".gif": return "image/gif";
            case ".svg": return "image/svg+xml";
            case ".wav": return "audio/wav";
            case ".mp4": return "video/mp4";
            case ".woff": return "application/font-woff";
            case ".ttf": return "application/font-ttf";
            case ".eot": return "application/vnd.ms-fontobject";
            case ".otf": return "application/font-otf";
            case ".wasm": return "application/wasm";
            default: return "application/octet-stream";
        }
    }
    
    static class ClientInfo {
        WebSocket conn;
        String playerId;
        boolean isHost;
        
        ClientInfo(WebSocket conn, String playerId, boolean isHost) {
            this.conn = conn;
            this.playerId = playerId;
            this.isHost = isHost;
        }
    }
    
    static class GameState {
        boolean started = false;
        double t = 0;
        boolean paused = false;
        boolean gameOver = false;
        Map<String, PlayerData> players = new ConcurrentHashMap<>();
        List<Object> enemies = new ArrayList<>();
        List<Object> projectiles = new ArrayList<>();
        List<Object> orbs = new ArrayList<>();
        
        JsonObject toJson() {
            JsonObject json = new JsonObject();
            json.addProperty("started", started);
            json.addProperty("t", t);
            json.addProperty("paused", paused);
            json.addProperty("gameOver", gameOver);
            
            JsonObject playersJson = new JsonObject();
            players.forEach((id, player) -> playersJson.add(id, player.toJson()));
            json.add("players", playersJson);
            
            json.add("enemies", gson.toJsonTree(enemies));
            json.add("projectiles", gson.toJsonTree(projectiles));
            json.add("orbs", gson.toJsonTree(orbs));
            
            return json;
        }
    }
    
    static class PlayerData {
        String id;
        float x, y, vx, vy;
        int hp, hpMax, level;
        String color;
        float damage, fireRate, pickup, regen, projSize, dashCd, dashCdMax;
        int pierce, projCount;
        
        JsonObject toJson() {
            JsonObject json = new JsonObject();
            json.addProperty("id", id);
            json.addProperty("x", x);
            json.addProperty("y", y);
            json.addProperty("vx", vx);
            json.addProperty("vy", vy);
            json.addProperty("hp", hp);
            json.addProperty("hpMax", hpMax);
            json.addProperty("level", level);
            json.addProperty("color", color);
            json.addProperty("damage", damage);
            json.addProperty("fireRate", fireRate);
            json.addProperty("pierce", pierce);
            json.addProperty("pickup", pickup);
            json.addProperty("regen", regen);
            json.addProperty("projSize", projSize);
            json.addProperty("projCount", projCount);
            json.addProperty("dashCd", dashCd);
            json.addProperty("dashCdMax", dashCdMax);
            return json;
        }
    }
}

