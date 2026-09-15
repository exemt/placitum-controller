import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

export function SideTitle({ label, hint }: { label: string; hint?: string }) {
  const text = (
    <Typography variant="body2" color="text.secondary">
      {label}
    </Typography>
  );

  return (
    <Stack spacing={0.5}>
      {hint === undefined ? (
        text
      ) : (
        <Tooltip title={hint}>
          <Box component="span" sx={{ alignSelf: 'flex-start' }}>
            {text}
          </Box>
        </Tooltip>
      )}

      <Divider sx={{ borderStyle: 'dashed', opacity: 0.6 }} />
    </Stack>
  );
}
