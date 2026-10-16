package dev.worldexplorer.common.web;

import dev.worldexplorer.common.config.AppProperties;
import dev.worldexplorer.common.error.ApiException;
import dev.worldexplorer.common.redis.RateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Applies two limits per minute: a strict one for /api/auth/** (brute-force protection, per IP)
 * and a generous one for the rest of the API (per user, or per IP for anonymous callers).
 * Sends the usual {@code X-RateLimit-*} headers and 429 + problem detail when exceeded.
 */
@Component
public class RateLimitInterceptor implements HandlerInterceptor {

    private static final Duration WINDOW = Duration.ofMinutes(1);

    private final RateLimiter limiter;
    private final AppProperties props;

    public RateLimitInterceptor(RateLimiter limiter, AppProperties props) {
        this.limiter = limiter;
        this.props = props;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        boolean auth = request.getRequestURI().startsWith("/api/auth/");
        String bucket = auth ? "auth" : "api";
        int limit = auth ? props.rateLimit().authPerMinute() : props.rateLimit().apiPerMinute();
        String subject = auth ? request.getRemoteAddr() : subject(request);

        RateLimiter.Decision d = limiter.hit(bucket, subject, limit, WINDOW);
        response.setHeader("X-RateLimit-Limit", String.valueOf(d.limit()));
        response.setHeader("X-RateLimit-Remaining", String.valueOf(d.remaining()));
        response.setHeader("X-RateLimit-Reset", String.valueOf(d.resetSeconds()));
        if (!d.allowed()) {
            response.setHeader("Retry-After", String.valueOf(d.resetSeconds()));
            throw ApiException.tooManyRequests("Too many requests. Try again in " + d.resetSeconds() + " s.");
        }
        return true;
    }

    private static String subject(HttpServletRequest request) {
        Authentication a = SecurityContextHolder.getContext().getAuthentication();
        if (a != null && a.isAuthenticated() && a.getName() != null && !"anonymousUser".equals(a.getName())) {
            return "u:" + a.getName();
        }
        return "ip:" + request.getRemoteAddr();
    }
}
