'use client';

import { Col, Container, Row } from 'react-bootstrap';
import BubbleMap from '../components/BubbleMap';

const Home = () => (
  <main
    style={{
      paddingTop: 24,
      paddingBottom: 24,
    }}
  >
    <Container
      id="landing-page"
      fluid
      className="py-3"
      style={{
        maxWidth: 1400,
      }}
    >
      <Row className="text-center">
        <Col xs={12} className="d-flex flex-column align-items-center mt-4">
          <h1
            className="mb-4"
            style={{
              color: '#e5e7eb',
              fontSize: 28,
            }}
          >
            ZHVI Visualization
          </h1>
          <p
            style={{
              marginTop: -12,
              marginBottom: 24,
              color: '#9ca3af',
              fontSize: 14,
            }}
          >
            Using ZHVI Single Family Home Time Series (ZIP code) as a metric, we can generalize price patterns and
            highlights regional trends in housing values. Through this visualization, the geographical wealth and
            housing developmental patterns of the years throughout 2000 - 2025 are visible. The bubbles scale from
            dark blue to yellow and small to large, based on lower average price and higher average price respectively.
            Each bubble represents a region of houses that have some ZHVI value, and upon clicking one, reveals the ZHVI
            trends for that location from 2000 - 2025.
          </p>
          <p
            style={{
              marginTop: -12,
              marginBottom: 24,
              color: '#9ca3af',
              fontSize: 14,
            }}
          >
            Explore average single-family home values across the United States. Zoom in to
            reveal finer-grained bubbles.
          </p>
          <div style={{ width: '100%' }}>
            <BubbleMap />
          </div>
        </Col>
      </Row>
    </Container>
  </main>
);

export default Home;
