using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Api.Controllers;

/// <summary>
/// Sample API controller for testing
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class SampleController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly ILogger<SampleController> _logger;

    public SampleController(AppDbContext context, ILogger<SampleController> logger)
    {
        _context = context;
        _logger = logger;
    }

    /// <summary>
    /// Get all sample items
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<SampleItem>>> GetAll()
    {
        _logger.LogInformation("Getting all sample items");
        var items = await _context.SampleItems.ToListAsync();
        return Ok(items);
    }

    /// <summary>
    /// Get a sample item by ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<SampleItem>> GetById(int id)
    {
        var item = await _context.SampleItems.FindAsync(id);
        if (item == null)
        {
            return NotFound();
        }
        return Ok(item);
    }

    /// <summary>
    /// Create a new sample item
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<SampleItem>> Create(SampleItem item)
    {
        _context.SampleItems.Add(item);
        await _context.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = item.Id }, item);
    }

    /// <summary>
    /// Update a sample item
    /// </summary>
    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, SampleItem item)
    {
        if (id != item.Id)
        {
            return BadRequest();
        }

        _context.Entry(item).State = EntityState.Modified;

        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            if (!await _context.SampleItems.AnyAsync(e => e.Id == id))
            {
                return NotFound();
            }
            throw;
        }

        return NoContent();
    }

    /// <summary>
    /// Delete a sample item
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var item = await _context.SampleItems.FindAsync(id);
        if (item == null)
        {
            return NotFound();
        }

        _context.SampleItems.Remove(item);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}
