import React from "react";
import { StarRating } from "./StarRating";
import { Card, Progress, Typography, Flex } from "antd";

const { Text } = Typography;

const RatingSummary = ({ summary }) => {
  if (!summary) return null;

  const { avg, count, distribution } = summary;

  return (
    <Card
      size="small"
      style={{ borderRadius: 8 }}
      styles={{ body: { padding: "16px 20px" } }}
    >
      <Flex gap={24} align="start" style={{ maxWidth: 480 }}>
        {/* Left: big number */}
        <Flex vertical align="center" justify="center" gap={2} style={{ minWidth: 72 }}>
          <span style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.1 }}>{avg || 0}</span>
          <StarRating value={Math.round(avg || 0)} size={13} />
          <Text type="secondary" style={{ fontSize: 11, marginTop: 2 }}>{count} đánh giá</Text>
        </Flex>

        {/* Right: distribution bars */}
        <Flex vertical gap={3} style={{ flex: 1 }}>
          {[5, 4, 3, 2, 1].map((star) => {
            const starCount = distribution?.[star] || 0;
            const pct = count > 0 ? Math.round((starCount / count) * 100) : 0;
            return (
              <Flex key={star} align="center" gap={6}>
                <Text type="secondary" style={{ width: 10, textAlign: "right", fontSize: 11, lineHeight: 1 }}>{star}</Text>
                <Progress
                  percent={pct}
                  showInfo={false}
                  size="small"
                  strokeColor="#faad14"
                  style={{ flex: 1, margin: 0 }}
                />
                <Text type="secondary" style={{ width: 20, textAlign: "right", fontSize: 11, lineHeight: 1 }}>{starCount}</Text>
              </Flex>
            );
          })}
        </Flex>
      </Flex>
    </Card>
  );
};

export default React.memo(RatingSummary);
