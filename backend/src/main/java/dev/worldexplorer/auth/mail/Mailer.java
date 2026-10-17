package dev.worldexplorer.auth.mail;

import dev.worldexplorer.common.config.AppProperties;
import java.time.Instant;
import java.util.ArrayList;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

/**
 * Sends e-mails. With {@code spring.mail.host} configured (e.g. Mailpit locally, a real SMTP server in
 * production) mails go out via SMTP; without it they are only logged. Either way the last 50 mails are
 * kept in memory so that local development and the tests can read verification / reset links
 * ({@code GET /api/dev/mails}, only when {@code app.auth.dev-mailbox=true}).
 */
@Component
public class Mailer {

    private static final Logger log = LoggerFactory.getLogger(Mailer.class);

    public record Mail(String to, String subject, String body, Instant sentAt) {}

    private final ObjectProvider<JavaMailSender> smtp;
    private final String from;
    private final Deque<Mail> recent = new ArrayDeque<>();

    public Mailer(ObjectProvider<JavaMailSender> smtp, AppProperties props) {
        this.smtp = smtp;
        this.from = props.auth().mailFrom();
    }

    public void send(String to, String subject, String body) {
        Mail mail = new Mail(to, subject, body, Instant.now());
        synchronized (recent) {
            recent.addFirst(mail);
            while (recent.size() > 50) recent.removeLast();
        }
        JavaMailSender sender = smtp.getIfAvailable();
        if (sender == null) {
            log.info("E-mail to {} – {}\n{}", to, subject, body);
            return;
        }
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(from);
            message.setTo(to);
            message.setSubject(subject);
            message.setText(body);
            sender.send(message);
        } catch (Exception e) {
            // never fail a registration because the mail server is down; the user can request a new link
            log.warn("Could not send e-mail to {}: {}", to, e.getMessage());
        }
    }

    public List<Mail> recent() {
        synchronized (recent) {
            return new ArrayList<>(recent);
        }
    }
}
