import { StarFilled, StarOutlined } from "@ant-design/icons";

const StarRating = ({ value = 0, size = 16, color = "#faad14" }) => {
  return (
    <span style={{ display: "inline-flex", gap: 2 }} role="img" aria-label={`${value} trên 5 sao`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} style={{ fontSize: size }}>
          {star <= value ? (
            <StarFilled style={{ color }} />
          ) : (
            <StarOutlined style={{ color: "#d9d9d9" }} />
          )}
        </span>
      ))}
    </span>
  );
};

const StarPicker = ({ value, onChange, size = 20 }) => {
  return (
    <span style={{ display: "inline-flex", gap: 2 }} role="radiogroup" aria-label="Chọn số sao">
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          role="button"
          tabIndex={0}
          onClick={() => onChange(star)}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onChange(star)}
          style={{
            fontSize: size,
            cursor: "pointer",
            background: "none",
            border: "none",
            padding: 0,
            transition: "transform 0.1s",
          }}
        >
          {star <= value ? (
            <StarFilled style={{ color: "#faad14" }} />
          ) : (
            <StarOutlined style={{ color: "#d9d9d9" }} />
          )}
        </span>
      ))}
    </span>
  );
};

export { StarRating, StarPicker };
