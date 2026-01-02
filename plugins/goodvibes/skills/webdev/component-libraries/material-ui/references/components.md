# Material UI Components Reference

Complete component catalog for MUI.

## Data Display

### Table

```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
  Paper,
  Checkbox,
} from '@mui/material';

function EnhancedTable() {
  const [selected, setSelected] = useState([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [orderBy, setOrderBy] = useState('name');
  const [order, setOrder] = useState('asc');

  const handleSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  return (
    <Paper>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={selected.length > 0 && selected.length < rows.length}
                  checked={rows.length > 0 && selected.length === rows.length}
                  onChange={handleSelectAll}
                />
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={orderBy === 'name'}
                  direction={orderBy === 'name' ? order : 'asc'}
                  onClick={() => handleSort('name')}
                >
                  Name
                </TableSortLabel>
              </TableCell>
              <TableCell align="right">Calories</TableCell>
              <TableCell align="right">Fat</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((row) => (
              <TableRow
                key={row.name}
                hover
                selected={selected.includes(row.id)}
                onClick={() => handleClick(row.id)}
              >
                <TableCell padding="checkbox">
                  <Checkbox checked={selected.includes(row.id)} />
                </TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell align="right">{row.calories}</TableCell>
                <TableCell align="right">{row.fat}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        rowsPerPageOptions={[5, 10, 25]}
        component="div"
        count={rows.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={(e, newPage) => setPage(newPage)}
        onRowsPerPageChange={(e) => setRowsPerPage(parseInt(e.target.value, 10))}
      />
    </Paper>
  );
}
```

### List

```tsx
import {
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Divider,
  ListSubheader,
} from '@mui/material';
import InboxIcon from '@mui/icons-material/Inbox';
import DraftsIcon from '@mui/icons-material/Drafts';

<List subheader={<ListSubheader>Nested List Items</ListSubheader>}>
  <ListItem disablePadding>
    <ListItemButton>
      <ListItemIcon>
        <InboxIcon />
      </ListItemIcon>
      <ListItemText primary="Inbox" secondary="5 new messages" />
    </ListItemButton>
  </ListItem>
  <ListItem disablePadding>
    <ListItemButton>
      <ListItemIcon>
        <DraftsIcon />
      </ListItemIcon>
      <ListItemText primary="Drafts" />
    </ListItemButton>
  </ListItem>
  <Divider />
  <ListItem>
    <ListItemAvatar>
      <Avatar src="/avatar.jpg" />
    </ListItemAvatar>
    <ListItemText primary="John Doe" secondary="Online" />
  </ListItem>
</List>
```

### Avatar

```tsx
import { Avatar, AvatarGroup, Badge } from '@mui/material';
import { styled } from '@mui/material/styles';

// Basic
<Avatar alt="John Doe" src="/avatar.jpg" />
<Avatar>JD</Avatar>
<Avatar sx={{ bgcolor: 'primary.main' }}>N</Avatar>

// Sizes
<Avatar sx={{ width: 24, height: 24 }}>S</Avatar>
<Avatar sx={{ width: 56, height: 56 }}>L</Avatar>

// Group
<AvatarGroup max={4}>
  <Avatar alt="User 1" src="/1.jpg" />
  <Avatar alt="User 2" src="/2.jpg" />
  <Avatar alt="User 3" src="/3.jpg" />
  <Avatar alt="User 4" src="/4.jpg" />
  <Avatar alt="User 5" src="/5.jpg" />
</AvatarGroup>

// With badge
const StyledBadge = styled(Badge)(({ theme }) => ({
  '& .MuiBadge-badge': {
    backgroundColor: '#44b700',
    color: '#44b700',
    boxShadow: `0 0 0 2px ${theme.palette.background.paper}`,
  },
}));

<StyledBadge
  overlap="circular"
  anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
  variant="dot"
>
  <Avatar alt="John Doe" src="/avatar.jpg" />
</StyledBadge>
```

### Chip

```tsx
import { Chip, Stack, Avatar } from '@mui/material';
import FaceIcon from '@mui/icons-material/Face';

<Stack direction="row" spacing={1}>
  <Chip label="Basic" />
  <Chip label="Outlined" variant="outlined" />
  <Chip label="Clickable" onClick={handleClick} />
  <Chip label="Deletable" onDelete={handleDelete} />
  <Chip avatar={<Avatar>M</Avatar>} label="With Avatar" />
  <Chip icon={<FaceIcon />} label="With Icon" />
  <Chip label="Primary" color="primary" />
  <Chip label="Success" color="success" />
</Stack>
```

### Tooltip

```tsx
import { Tooltip, Button, IconButton, Zoom, Fade } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';

<Tooltip title="Delete">
  <IconButton>
    <DeleteIcon />
  </IconButton>
</Tooltip>

// Placement
<Tooltip title="Top" placement="top">
  <Button>Top</Button>
</Tooltip>

// Custom transition
<Tooltip TransitionComponent={Zoom} title="Zoom">
  <Button>Zoom</Button>
</Tooltip>

// With arrow
<Tooltip title="Arrow" arrow>
  <Button>Arrow</Button>
</Tooltip>
```

### Badge

```tsx
import { Badge, IconButton, Switch, FormControlLabel } from '@mui/material';
import MailIcon from '@mui/icons-material/Mail';

<Badge badgeContent={4} color="primary">
  <MailIcon />
</Badge>

<Badge badgeContent={100} max={99} color="secondary">
  <MailIcon />
</Badge>

<Badge variant="dot" color="primary">
  <MailIcon />
</Badge>

<Badge badgeContent={0} showZero color="primary">
  <MailIcon />
</Badge>

<Badge
  badgeContent={4}
  anchorOrigin={{
    vertical: 'bottom',
    horizontal: 'right',
  }}
>
  <MailIcon />
</Badge>
```

## Inputs

### Checkbox

```tsx
import {
  Checkbox,
  FormGroup,
  FormControlLabel,
  FormControl,
  FormLabel,
} from '@mui/material';

<FormControl component="fieldset">
  <FormLabel component="legend">Select options</FormLabel>
  <FormGroup>
    <FormControlLabel
      control={<Checkbox checked={state.gilpirate} onChange={handleChange} name="gilpirate" />}
      label="Gilpirate"
    />
    <FormControlLabel
      control={<Checkbox checked={state.jason} onChange={handleChange} name="jason" />}
      label="Jason"
    />
    <FormControlLabel
      control={<Checkbox />}
      label="Disabled"
      disabled
    />
  </FormGroup>
</FormControl>

// Indeterminate
<Checkbox
  checked={checked[0] && checked[1]}
  indeterminate={checked[0] !== checked[1]}
  onChange={handleChange}
/>
```

### Radio

```tsx
import {
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  FormLabel,
} from '@mui/material';

<FormControl>
  <FormLabel id="demo-radio-group">Gender</FormLabel>
  <RadioGroup
    aria-labelledby="demo-radio-group"
    name="gender"
    value={value}
    onChange={handleChange}
  >
    <FormControlLabel value="female" control={<Radio />} label="Female" />
    <FormControlLabel value="male" control={<Radio />} label="Male" />
    <FormControlLabel value="other" control={<Radio />} label="Other" />
  </RadioGroup>
</FormControl>
```

### Switch

```tsx
import { Switch, FormControlLabel, FormGroup } from '@mui/material';

<FormGroup>
  <FormControlLabel
    control={<Switch checked={checked} onChange={handleChange} />}
    label="Enable feature"
  />
  <FormControlLabel
    control={<Switch defaultChecked />}
    label="Default checked"
  />
  <FormControlLabel
    disabled
    control={<Switch />}
    label="Disabled"
  />
</FormGroup>
```

### Slider

```tsx
import { Slider, Box, Typography } from '@mui/material';

// Basic
<Slider defaultValue={30} aria-label="Default" />

// With marks
<Slider
  defaultValue={20}
  step={10}
  marks
  min={10}
  max={110}
/>

// Custom marks
const marks = [
  { value: 0, label: '0C' },
  { value: 20, label: '20C' },
  { value: 37, label: '37C' },
  { value: 100, label: '100C' },
];

<Slider
  defaultValue={37}
  step={null}
  marks={marks}
/>

// Range slider
<Slider
  getAriaLabel={() => 'Temperature range'}
  value={value}
  onChange={handleChange}
  valueLabelDisplay="auto"
/>
```

### Autocomplete

```tsx
import { Autocomplete, TextField, Chip } from '@mui/material';

// Basic
<Autocomplete
  options={top100Films}
  getOptionLabel={(option) => option.title}
  renderInput={(params) => <TextField {...params} label="Movie" />}
/>

// Multiple
<Autocomplete
  multiple
  options={top100Films}
  getOptionLabel={(option) => option.title}
  defaultValue={[top100Films[13]]}
  renderInput={(params) => (
    <TextField {...params} label="Movies" placeholder="Favorites" />
  )}
  renderTags={(value, getTagProps) =>
    value.map((option, index) => (
      <Chip label={option.title} {...getTagProps({ index })} />
    ))
  }
/>

// Async
<Autocomplete
  options={options}
  loading={loading}
  onInputChange={(event, newInputValue) => {
    setInputValue(newInputValue);
  }}
  renderInput={(params) => (
    <TextField
      {...params}
      label="Async"
      InputProps={{
        ...params.InputProps,
        endAdornment: (
          <>
            {loading ? <CircularProgress size={20} /> : null}
            {params.InputProps.endAdornment}
          </>
        ),
      }}
    />
  )}
/>
```

## Navigation

### Drawer

```tsx
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  IconButton,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import InboxIcon from '@mui/icons-material/MoveToInbox';

function TemporaryDrawer() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <IconButton onClick={() => setOpen(true)}>
        <MenuIcon />
      </IconButton>
      <Drawer
        anchor="left"
        open={open}
        onClose={() => setOpen(false)}
      >
        <Box
          sx={{ width: 250 }}
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <List>
            {['Inbox', 'Starred', 'Send email', 'Drafts'].map((text, index) => (
              <ListItem key={text} disablePadding>
                <ListItemButton>
                  <ListItemIcon>
                    <InboxIcon />
                  </ListItemIcon>
                  <ListItemText primary={text} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      </Drawer>
    </>
  );
}
```

### Breadcrumbs

```tsx
import { Breadcrumbs, Link, Typography } from '@mui/material';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

<Breadcrumbs
  separator={<NavigateNextIcon fontSize="small" />}
  aria-label="breadcrumb"
>
  <Link underline="hover" color="inherit" href="/">
    Home
  </Link>
  <Link underline="hover" color="inherit" href="/products">
    Products
  </Link>
  <Typography color="text.primary">Item</Typography>
</Breadcrumbs>
```

### Stepper

```tsx
import {
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Button,
  Typography,
  Box,
} from '@mui/material';

function VerticalStepper() {
  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    { label: 'Select campaign settings', description: 'For each ad campaign...' },
    { label: 'Create an ad group', description: 'An ad group contains...' },
    { label: 'Create an ad', description: 'Try out different ads...' },
  ];

  return (
    <Stepper activeStep={activeStep} orientation="vertical">
      {steps.map((step, index) => (
        <Step key={step.label}>
          <StepLabel>{step.label}</StepLabel>
          <StepContent>
            <Typography>{step.description}</Typography>
            <Box sx={{ mb: 2 }}>
              <Button
                variant="contained"
                onClick={() => setActiveStep(index + 1)}
                sx={{ mt: 1, mr: 1 }}
              >
                {index === steps.length - 1 ? 'Finish' : 'Continue'}
              </Button>
              <Button
                disabled={index === 0}
                onClick={() => setActiveStep(index - 1)}
                sx={{ mt: 1, mr: 1 }}
              >
                Back
              </Button>
            </Box>
          </StepContent>
        </Step>
      ))}
    </Stepper>
  );
}
```

### BottomNavigation

```tsx
import { BottomNavigation, BottomNavigationAction, Paper } from '@mui/material';
import RestoreIcon from '@mui/icons-material/Restore';
import FavoriteIcon from '@mui/icons-material/Favorite';
import LocationOnIcon from '@mui/icons-material/LocationOn';

<Paper sx={{ position: 'fixed', bottom: 0, left: 0, right: 0 }} elevation={3}>
  <BottomNavigation
    showLabels
    value={value}
    onChange={(event, newValue) => setValue(newValue)}
  >
    <BottomNavigationAction label="Recents" icon={<RestoreIcon />} />
    <BottomNavigationAction label="Favorites" icon={<FavoriteIcon />} />
    <BottomNavigationAction label="Nearby" icon={<LocationOnIcon />} />
  </BottomNavigation>
</Paper>
```

### SpeedDial

```tsx
import { SpeedDial, SpeedDialIcon, SpeedDialAction } from '@mui/material';
import FileCopyIcon from '@mui/icons-material/FileCopyOutlined';
import SaveIcon from '@mui/icons-material/Save';
import PrintIcon from '@mui/icons-material/Print';
import ShareIcon from '@mui/icons-material/Share';

const actions = [
  { icon: <FileCopyIcon />, name: 'Copy' },
  { icon: <SaveIcon />, name: 'Save' },
  { icon: <PrintIcon />, name: 'Print' },
  { icon: <ShareIcon />, name: 'Share' },
];

<SpeedDial
  ariaLabel="SpeedDial"
  sx={{ position: 'absolute', bottom: 16, right: 16 }}
  icon={<SpeedDialIcon />}
>
  {actions.map((action) => (
    <SpeedDialAction
      key={action.name}
      icon={action.icon}
      tooltipTitle={action.name}
      onClick={handleClose}
    />
  ))}
</SpeedDial>
```

## Feedback

### Progress

```tsx
import { CircularProgress, LinearProgress, Box, Typography } from '@mui/material';

// Circular
<CircularProgress />
<CircularProgress color="secondary" />
<CircularProgress variant="determinate" value={75} />

// With label
<Box sx={{ position: 'relative', display: 'inline-flex' }}>
  <CircularProgress variant="determinate" value={progress} />
  <Box
    sx={{
      position: 'absolute',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
    }}
  >
    <Typography variant="caption">{`${Math.round(progress)}%`}</Typography>
  </Box>
</Box>

// Linear
<LinearProgress />
<LinearProgress color="secondary" />
<LinearProgress variant="determinate" value={progress} />
<LinearProgress variant="buffer" value={progress} valueBuffer={buffer} />
```

### Skeleton

```tsx
import { Skeleton, Box, Typography, Avatar } from '@mui/material';

// Variants
<Skeleton variant="text" sx={{ fontSize: '1rem' }} />
<Skeleton variant="circular" width={40} height={40} />
<Skeleton variant="rectangular" width={210} height={60} />
<Skeleton variant="rounded" width={210} height={60} />

// Animation
<Skeleton animation="wave" />
<Skeleton animation={false} />

// Complete example
{loading ? (
  <Box sx={{ display: 'flex', alignItems: 'center' }}>
    <Skeleton variant="circular">
      <Avatar />
    </Skeleton>
    <Box sx={{ ml: 1 }}>
      <Skeleton width={100}>
        <Typography>.</Typography>
      </Skeleton>
    </Box>
  </Box>
) : (
  <Box sx={{ display: 'flex', alignItems: 'center' }}>
    <Avatar src="/avatar.jpg" />
    <Typography sx={{ ml: 1 }}>John Doe</Typography>
  </Box>
)}
```

### Backdrop

```tsx
import { Backdrop, CircularProgress, Button } from '@mui/material';

<Backdrop
  sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }}
  open={open}
  onClick={handleClose}
>
  <CircularProgress color="inherit" />
</Backdrop>
```
