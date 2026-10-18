package dev.worldexplorer.quiz.engine;

import java.io.IOException;
import java.io.InputStream;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * Serves flag SVGs for flag questions. The flags are the frontend's {@code frontend/public/flags/*.svg}, copied
 * into the jar by Maven. They are streamed by the backend (instead of linking {@code /flags/DEU.svg})
 * so the image URL does not give the answer away.
 */
@Component
public class FlagStore {

    private final ConcurrentHashMap<String, byte[]> cache = new ConcurrentHashMap<>();

    public Optional<byte[]> svg(String countryCode) {
        String code = countryCode.toUpperCase();
        if (!code.matches("[A-Z]{3}")) return Optional.empty();
        byte[] bytes = cache.computeIfAbsent(code, c -> {
            ClassPathResource r = new ClassPathResource("flags/" + c + ".svg");
            if (!r.exists()) return new byte[0];
            try (InputStream in = r.getInputStream()) {
                return in.readAllBytes();
            } catch (IOException e) {
                return new byte[0];
            }
        });
        return bytes.length == 0 ? Optional.empty() : Optional.of(bytes);
    }
}
