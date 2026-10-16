package dev.worldexplorer.atlas;

import java.security.SecureRandom;
import org.springframework.stereotype.Component;

/** Short, URL-friendly ids for share links. No 0/O/1/l/I to avoid confusion when typed by hand. */
@Component
public class SlugGenerator {

    private static final String ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
    private static final SecureRandom RANDOM = new SecureRandom();

    public String next(int length) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) sb.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        return sb.toString();
    }
}
