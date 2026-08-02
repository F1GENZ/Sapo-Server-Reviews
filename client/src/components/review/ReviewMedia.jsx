import { useState } from "react";
import { Modal, Flex, Button } from "antd";
import { PlayCircleOutlined } from "@ant-design/icons";
import { getVideoEmbedUrl, isDirectVideoUrl } from "../../common/mediaUrl";

const ReviewMedia = ({ items = [] }) => {
  const [lightbox, setLightbox] = useState(null);

  if (items.length === 0) return null;

  return (
    <>
      <Flex wrap="wrap" gap={8}>
        {items.map((item, idx) => (
          <button
            type="button"
            key={idx}
            onClick={() => setLightbox(item)}
            aria-label={`Mở ${item.type === "video" ? "video" : "ảnh"} đánh giá ${idx + 1}`}
            style={{
              width: 64, height: 64,
              borderRadius: 8,
              overflow: "hidden",
              border: "1px solid #d9d9d9",
              background: "transparent",
              padding: 0,
              cursor: "pointer",
              position: "relative",
            }}
          >
            {item.type === "video" ? (
              <Flex align="center" justify="center" style={{ width: "100%", height: "100%", background: "#fafafa" }}>
                <PlayCircleOutlined style={{ fontSize: 20, color: "#999" }} />
              </Flex>
            ) : (
              <img src={item.url} alt="" loading="lazy" decoding="async" width="64" height="64" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            )}
          </button>
        ))}
      </Flex>

      <Modal
        open={!!lightbox}
        onCancel={() => setLightbox(null)}
        footer={null}
        width={720}
        centered
        destroyOnHidden
      >
        {lightbox?.type === "video" && getVideoEmbedUrl(lightbox.url) ? (
          <iframe
            src={getVideoEmbedUrl(lightbox.url)}
            title="Video đánh giá"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ width: "100%", aspectRatio: "16 / 9", border: 0, borderRadius: 8 }}
          />
        ) : lightbox?.type === "video" && isDirectVideoUrl(lightbox.url) ? (
          <video src={lightbox.url} controls preload="metadata" style={{ maxHeight: "70vh", width: "100%" }} />
        ) : lightbox?.type === "video" ? (
          <Flex align="center" justify="center" vertical gap={12} style={{ minHeight: 180 }}>
            <PlayCircleOutlined style={{ fontSize: 36, color: "#8c8c8c" }} />
            <Button type="primary" href={lightbox.url} target="_blank" rel="noopener noreferrer">
              Mở video
            </Button>
          </Flex>
        ) : lightbox ? (
          <img src={lightbox.url} alt="" style={{ maxHeight: "70vh", width: "100%", objectFit: "contain" }} />
        ) : null}
      </Modal>
    </>
  );
};

export default ReviewMedia;
