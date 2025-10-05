#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* ssid = "EDILMA_2.5";
const char* password = "99399603";
const char* backend = "http://192.168.0.104:3000";

const int ledPin = 2;  // LED interno do ESP32
String paymentId = "";
String qrData = "";

// Declarações antecipadas
void createCharge(float amount, const char* description);
bool checkPaymentStatus();
void dispense();

void setup() {
  Serial.begin(115200);
  pinMode(ledPin, OUTPUT);
  digitalWrite(ledPin, LOW);  // LED inicialmente apagado
  
  WiFi.begin(ssid, password);
  Serial.print("Conectando WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    // Pisca rápido durante conexão
    digitalWrite(ledPin, !digitalRead(ledPin));
  }
  
  Serial.println("\n✅ WiFi conectado! IP: " + WiFi.localIP().toString());
  digitalWrite(ledPin, HIGH);  // LED aceso quando conectado
  
  // Cria cobrança de teste
  createCharge(0.50, "Produto teste");
}

void createCharge(float amount, const char* description) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi desconectado");
    digitalWrite(ledPin, LOW);  // LED apagado se sem WiFi
    return;
  }
  
  HTTPClient http;
  String url = String(backend) + "/create_charge";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  String body = String("{\"amount\":") + String(amount, 2) + ",\"description\":\"" + description + "\"}";
  
  Serial.println("Enviando requisição para: " + url);
  Serial.println("Body: " + body);
  
  // Pisca LED durante requisição
  digitalWrite(ledPin, LOW);
  delay(100);
  digitalWrite(ledPin, HIGH);
  
  int code = http.POST(body);
  
  if (code == 200) {
    String payload = http.getString();
    Serial.println("create_charge response:");
    Serial.println(payload);
    
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, payload);
    
    if (!err) {
      paymentId = doc["paymentId"].as<String>();
      if (doc["qrData"]) qrData = doc["qrData"].as<String>();
      
      Serial.println("paymentId: " + paymentId);
      Serial.println("qrData: " + qrData);
      
      // LED pisca 2x rápido para indicar sucesso
      for(int i = 0; i < 2; i++) {
        digitalWrite(ledPin, LOW);
        delay(200);
        digitalWrite(ledPin, HIGH);
        delay(200);
      }
    } else {
      Serial.println("Erro parse JSON: " + String(err.c_str()));
      // LED pisca lento para indicar erro
      digitalWrite(ledPin, LOW);
      delay(1000);
      digitalWrite(ledPin, HIGH);
    }
  } else {
    Serial.printf("Erro HTTP create_charge: %d\n", code);
    digitalWrite(ledPin, LOW);  // LED apagado em caso de erro
  }
  http.end();
}

bool checkPaymentStatus() {
  if (paymentId.length() == 0) return false;
  if (WiFi.status() != WL_CONNECTED) return false;
  
  HTTPClient http;
  String url = String(backend) + "/status/" + paymentId;
  http.begin(url);
  
  // Pisca LED durante verificação
  digitalWrite(ledPin, !digitalRead(ledPin));
  
  int code = http.GET();
  
  if (code == 200) {
    String payload = http.getString();
    Serial.println("Status: " + payload);
    
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, payload);
    
    if (!err) {
      String status = doc["status"].as<String>();
      Serial.println("status: " + status);
      http.end();
      
      if (status == "approved" || status == "paid" || status == "PAID") return true;
      return false;
    }
  } else {
    Serial.printf("Erro HTTP status: %d\n", code);
  }
  http.end();
  return false;
}

void dispense() {
  Serial.println("💰 Pagamento confirmado! Acionando LED...");
  
  // Sequência de LED para indicar dispensa
  for(int i = 0; i < 5; i++) {
    digitalWrite(ledPin, LOW);
    delay(200);
    digitalWrite(ledPin, HIGH);
    delay(200);
  }
  
  Serial.println("✅ 'Produto dispensado' (LED acionado)");
}

unsigned long lastPoll = 0;
void loop() {
  if (paymentId.length() == 0) {
    // LED pisca lentamente aguardando nova transação
    static unsigned long lastBlink = 0;
    if (millis() - lastBlink > 2000) {
      lastBlink = millis();
      digitalWrite(ledPin, !digitalRead(ledPin));
    }
    delay(100);
    return;
  }
  
  if (millis() - lastPoll > 5000) {
    lastPoll = millis();
    bool paid = checkPaymentStatus();
    
    if (paid) {
      dispense();
      paymentId = ""; // Reseta para novo ciclo
    } else {
      Serial.println("⏳ Aguardando pagamento...");
      // LED permanece aceso aguardando pagamento
      digitalWrite(ledPin, HIGH);
    }
  }
  
  delay(100);
}